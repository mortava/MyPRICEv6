import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { generateId } from '@/lib/utils'

export interface LiveChatMessage {
  id: string
  conversation_id: string
  sender_role: 'user' | 'agent'
  sender_name: string
  content: string
  created_at: string
}

export interface LiveChatConversation {
  id: string
  user_id: string
  user_name: string
  status: 'open' | 'closed'
  department: 'support' | 'sales'
  created_at: string
}

interface UseLiveChatOptions {
  userId?: string
  userName?: string
}

// Request notification permission on first use
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function showDesktopNotification(senderName: string, content: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(`${senderName} — OpenPrice Chat`, {
      body: content.length > 100 ? content.slice(0, 100) + '...' : content,
      icon: '/vite.svg',
      tag: 'openprice-chat',
    })
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
    setTimeout(() => notification.close(), 4000)
  }
}

export function useLiveChat({ userId, userName }: UseLiveChatOptions = {}) {
  const [conversation, setConversation] = useState<LiveChatConversation | null>(null)
  const [messages, setMessages] = useState<LiveChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)

  const resolvedUserId = userId || 'anonymous-' + generateId()
  const resolvedUserName = userName || 'Guest'

  // Request notification permission
  useEffect(() => {
    requestNotificationPermission()
  }, [])

  // Subscribe to real-time messages for the active conversation
  useEffect(() => {
    if (!supabase || !conversation) return

    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new as LiveChatMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          // Desktop notification for agent messages
          if (newMsg.sender_role === 'agent') {
            showDesktopNotification(newMsg.sender_name, newMsg.content)
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase!.removeChannel(channel)
      channelRef.current = null
    }
  }, [conversation?.id])

  // Load existing open conversation on mount
  useEffect(() => {
    if (!supabase) return

    async function loadExisting() {
      const { data } = await supabase!
        .from('chat_conversations')
        .select('*')
        .eq('user_id', resolvedUserId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        setConversation(data as LiveChatConversation)
        const { data: msgs } = await supabase!
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', data.id)
          .order('created_at', { ascending: true })

        if (msgs) setMessages(msgs as LiveChatMessage[])
      }
    }

    loadExisting()
  }, [resolvedUserId])

  const startConversation = useCallback(
    async (department: 'support' | 'sales' = 'support') => {
      if (!supabase) {
        // Fallback: local-only mode when Supabase is not configured
        const localConvo: LiveChatConversation = {
          id: generateId(),
          user_id: resolvedUserId,
          user_name: resolvedUserName,
          status: 'open',
          department,
          created_at: new Date().toISOString(),
        }
        setConversation(localConvo)
        setMessages([])
        return localConvo
      }

      setLoading(true)
      const { data, error } = await supabase
        .from('chat_conversations')
        .insert({
          user_id: resolvedUserId,
          user_name: resolvedUserName,
          department,
        })
        .select()
        .single()

      setLoading(false)
      if (error) throw error

      const convo = data as LiveChatConversation
      setConversation(convo)
      setMessages([])
      return convo
    },
    [resolvedUserId, resolvedUserName]
  )

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return

      const localMsg: LiveChatMessage = {
        id: generateId(),
        conversation_id: conversation?.id || '',
        sender_role: 'user',
        sender_name: resolvedUserName,
        content: content.trim(),
        created_at: new Date().toISOString(),
      }

      if (!supabase || !conversation) {
        // Local-only fallback
        setMessages((prev) => [...prev, localMsg])
        return
      }

      // Optimistic update
      setMessages((prev) => [...prev, localMsg])

      const { error } = await supabase.from('chat_messages').insert({
        conversation_id: conversation.id,
        sender_role: 'user',
        sender_name: resolvedUserName,
        content: content.trim(),
      })

      if (error) {
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== localMsg.id))
        throw error
      }

      // Update conversation timestamp
      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversation.id)
    },
    [conversation, resolvedUserName]
  )

  const endConversation = useCallback(async () => {
    if (supabase && conversation) {
      await supabase
        .from('chat_conversations')
        .update({ status: 'closed' })
        .eq('id', conversation.id)
    }
    setConversation(null)
    setMessages([])
  }, [conversation])

  return {
    conversation,
    messages,
    loading,
    startConversation,
    sendMessage,
    endConversation,
    isConnected: !!supabase,
  }
}
