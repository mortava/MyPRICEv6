import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, ArrowLeft } from 'lucide-react'
import { useLiveChat } from '@/hooks/use-live-chat'
import { cn } from '@/lib/utils'

interface LiveChatProps {
  userId?: string
  userName?: string
}

export function LiveChat({ userId, userName }: LiveChatProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [department, setDepartment] = useState<'support' | 'sales' | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    conversation,
    messages,
    loading,
    startConversation,
    sendMessage,
    endConversation,
  } = useLiveChat({ userId, userName })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when chat opens
  useEffect(() => {
    if (open && conversation) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, conversation])

  async function handleStartChat(dept: 'support' | 'sales') {
    setDepartment(dept)
    await startConversation(dept)
  }

  async function handleSend() {
    if (!input.trim()) return
    const msg = input
    setInput('')
    await sendMessage(msg)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleEnd() {
    await endConversation()
    setDepartment(null)
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 flex w-[360px] flex-col overflow-hidden rounded-[12px] bg-white"
          style={{
            height: '480px',
            border: '1px solid rgba(39, 39, 42, 0.15)',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: '1px solid rgba(39, 39, 42, 0.15)' }}
          >
            <div className="flex items-center gap-3">
              {conversation && (
                <button
                  onClick={handleEnd}
                  className="flex h-8 w-8 items-center justify-center rounded-[8px] transition-all duration-150 hover:bg-[#F4F4F5]"
                  title="End conversation"
                >
                  <ArrowLeft className="h-4 w-4 text-black" />
                </button>
              )}
              <div>
                <h3 className="text-[15px] font-semibold text-black" style={{ letterSpacing: '-0.02em' }}>
                  {conversation
                    ? department === 'sales' ? 'Sales Team' : 'Help Desk'
                    : 'Live Chat'}
                </h3>
                <p className="text-[12px] text-[#71717A]">
                  {conversation ? (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                      Connected
                    </span>
                  ) : (
                    'OpenBroker Labs'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] transition-all duration-150 hover:bg-[#F4F4F5]"
              title="Close chat"
            >
              <X className="h-4 w-4 text-black" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {!conversation ? (
              /* Department Selection */
              <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#FAFAFA]">
                  <MessageCircle className="h-6 w-6 text-black" />
                </div>
                <h4 className="mb-1 text-[15px] font-semibold text-black" style={{ letterSpacing: '-0.02em' }}>
                  How can we help?
                </h4>
                <p className="mb-6 text-center text-[13px] text-[#A1A1AA]">
                  Choose a team to start a conversation.
                </p>
                <div className="flex w-full flex-col gap-3">
                  <button
                    onClick={() => handleStartChat('support')}
                    disabled={loading}
                    className="flex w-full items-center gap-4 rounded-[12px] bg-white px-5 py-[18px] text-left transition-all duration-200 hover:bg-[#FAFAFA]"
                    style={{
                      border: '1px solid rgba(39, 39, 42, 0.15)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(39, 39, 42, 0.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(39, 39, 42, 0.15)')}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#FAFAFA]">
                      <MessageCircle className="h-5 w-5 text-black" />
                    </div>
                    <div>
                      <span className="text-[14px] font-medium text-black">Help Desk</span>
                      <p className="text-[13px] text-[#A1A1AA]">Technical support & questions</p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleStartChat('sales')}
                    disabled={loading}
                    className="flex w-full items-center gap-4 rounded-[12px] bg-white px-5 py-[18px] text-left transition-all duration-200 hover:bg-[#FAFAFA]"
                    style={{
                      border: '1px solid rgba(39, 39, 42, 0.15)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(39, 39, 42, 0.3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(39, 39, 42, 0.15)')}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#FAFAFA]">
                      <MessageCircle className="h-5 w-5 text-black" />
                    </div>
                    <div>
                      <span className="text-[14px] font-medium text-black">Sales Team</span>
                      <p className="text-[13px] text-[#A1A1AA]">Pricing, demos & partnerships</p>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              /* Chat Messages */
              <>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <p className="text-[13px] text-[#A1A1AA]">
                        {department === 'sales'
                          ? 'A sales representative will be with you shortly.'
                          : 'A support agent will be with you shortly.'}
                      </p>
                    </div>
                  )}
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'mb-3 flex flex-col',
                        msg.sender_role === 'user' ? 'items-end' : 'items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[80%] rounded-[12px] px-4 py-2.5 text-[14px]',
                          msg.sender_role === 'user'
                            ? 'bg-black text-white'
                            : 'bg-[#FAFAFA] text-black'
                        )}
                        style={
                          msg.sender_role === 'agent'
                            ? { border: '1px solid rgba(39, 39, 42, 0.15)' }
                            : undefined
                        }
                      >
                        {msg.sender_role === 'agent' && (
                          <p className="mb-1 text-[11px] font-medium text-[#71717A]" style={{ letterSpacing: '0.02em' }}>
                            {msg.sender_name}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      <span className="mt-1 text-[11px] text-[#A1A1AA]">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-4 pb-4 pt-2" style={{ borderTop: '1px solid rgba(39, 39, 42, 0.1)' }}>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      className="flex-1 rounded-[8px] bg-white px-3 py-2.5 text-[14px] text-black placeholder:text-[#A1A1AA] outline-none transition-all duration-150 focus:border-black"
                      style={{ border: '1px solid rgba(39, 39, 42, 0.3)' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-black text-white transition-all duration-150 hover:opacity-85 disabled:opacity-40"
                      title="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-[12px] bg-black text-white transition-all duration-150 hover:opacity-85"
        style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}
        title={open ? 'Close chat' : 'Open live chat'}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>
    </>
  )
}
