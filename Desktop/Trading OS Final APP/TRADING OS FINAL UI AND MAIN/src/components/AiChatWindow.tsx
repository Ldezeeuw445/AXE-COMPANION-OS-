import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Minus, Maximize2, Send, Sparkles, Lock, Bot, User, Paperclip, Mic } from 'lucide-react';
import { getAuthedUserId, loadThread, sendUserMessage, type AxeMessage } from '@/lib/axeChatClient';

interface AiChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * AI TRADING ASSISTANT CHAT WINDOW
 *
 * Premium floating chat window for the AXE AI Trading Assistant.
 * - Draggable: click and drag the header to move
 * - Resizable: drag the bottom-right corner to resize
 * - Premium UI: gradient borders, glow effects, backdrop blur
 * - Placeholder: ready for your encrypted chat + AI integration
 */

export default function AiChatWindow({ isOpen, onClose }: AiChatWindowProps) {
  // Position & size state
  const [pos, setPos] = useState({ x: window.innerWidth - 420, y: 80 });
  const [size, setSize] = useState({ width: 380, height: 520 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Drag state
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Resize state
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });

  const [messages, setMessages] = useState<AxeMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [authedUserId, setAuthedUserIdState] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    let alive = true;
    async function boot() {
      setThreadError(null);
      setLoadingThread(true);
      try {
        const uid = await getAuthedUserId();
        if (!alive) return;
        setAuthedUserIdState(uid);
        if (!uid) {
          setConversationId(null);
          setMessages([]);
          return;
        }
        const thread = await loadThread(uid);
        if (!alive) return;
        if (!thread) {
          setConversationId(null);
          setMessages([]);
          return;
        }
        setConversationId(thread.conversation.id);
        setMessages(thread.messages);
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : String(e);
        setThreadError(msg);
      } finally {
        if (alive) setLoadingThread(false);
      }
    }
    if (isOpen) boot();
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue('');

    const optimistic: AxeMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    if (!authedUserId || !conversationId) {
      setThreadError('Sign in required to persist chat.');
      return;
    }

    try {
      await sendUserMessage(authedUserId, conversationId, text);
      const thread = await loadThread(authedUserId);
      if (thread) setMessages(thread.messages);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setThreadError(msg);
    }
  }, [inputValue, authedUserId, conversationId]);

  // ─── Drag handlers ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chat-no-drag')) return;
    setDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragging) {
      const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    }
    if (resizing) {
      const newW = Math.max(300, Math.min(window.innerWidth - pos.x, resizeStart.current.width + (e.clientX - resizeStart.current.x)));
      const newH = Math.max(350, Math.min(window.innerHeight - pos.y - 20, resizeStart.current.height + (e.clientY - resizeStart.current.y)));
      setSize({ width: newW, height: newH });
    }
  }, [dragging, resizing, pos, size.width]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    setResizing(false);
  }, []);

  useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, resizing, handleMouseMove, handleMouseUp]);

  // ─── Resize handler ───
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setResizing(true);
    resizeStart.current = { width: size.width, height: size.height, x: e.clientX, y: e.clientY };
  }, [size]);

  // ─── Maximize / Minimize ───
  const handleMaximize = () => {
    if (isMaximized) {
      setSize({ width: 380, height: 520 });
      setPos({ x: window.innerWidth - 420, y: 80 });
    } else {
      setSize({ width: window.innerWidth - 100, height: window.innerHeight - 100 });
      setPos({ x: 50, y: 50 });
    }
    setIsMaximized(!isMaximized);
    setIsMinimized(false);
  };

  const handleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[100] flex flex-col"
      style={{
        left: pos.x,
        top: pos.y,
        width: isMinimized ? 280 : size.width,
        height: isMinimized ? 44 : size.height,
        transition: isMaximized ? 'none' : undefined,
      }}
    >
      {/* ═══ Premium gradient border glow (subtle) ═══ */}
      <div
        className="absolute -inset-[1px] rounded-xl opacity-25 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, #a3e635 0%, #06b6d4 50%, #8b5cf6 100%)',
          filter: 'blur(2px)',
        }}
      />

      {/* ═══ Main window ═══ */}
      <div className="relative flex flex-col w-full h-full rounded-xl bg-[#0f0f12]/95 backdrop-blur-xl border border-white/[0.08] overflow-hidden shadow-2xl shadow-purple-500/10">

        {/* ═══ Header (drag handle) ═══ */}
        <div
          className={`flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06] cursor-move select-none bg-gradient-to-r from-white/[0.03] to-transparent ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2.5">
            {/* AXE Logo */}
            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 border border-white/[0.1]">
              <img src="/assets/axe-logo.png" alt="AXE" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white/90 tracking-wide">AXE</span>
                <span className="text-[9px] text-transparent bg-clip-text font-semibold" style={{ backgroundImage: 'linear-gradient(135deg, #a3e635, #06b6d4)' }}>AI ASSISTANT</span>
              </div>
              <div className="flex items-center gap-1">
                <Lock size={8} className="text-emerald-400" />
                <span className="text-[8px] text-emerald-400/70">Encrypted</span>
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                <span className="text-[8px] text-emerald-400/70">Online</span>
              </div>
            </div>
          </div>

          {/* Window controls */}
          <div className="flex items-center gap-1 chat-no-drag">
            <button
              onClick={handleMinimize}
              className="w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-all"
              title={isMinimized ? 'Restore' : 'Minimize'}
            >
              <Minus size={12} />
            </button>
            <button
              onClick={handleMaximize}
              className="w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-all"
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              <Maximize2 size={12} />
            </button>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-md flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* ═══ Chat content (hidden when minimized) ═══ */}
        {!isMinimized && (
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-hide">
              {/* Premium badge */}
              <div className="flex justify-center mb-3">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-purple-500/20 bg-purple-500/5">
                  <Sparkles size={10} className="text-purple-400" />
                  <span className="text-[9px] text-purple-300/70 font-medium">PREMIUM FEATURE</span>
                </div>
              </div>

              {loadingThread ? (
                <div className="text-[10px] text-white/30 text-center py-6">Loading chat…</div>
              ) : !authedUserId ? (
                <div className="text-[10px] text-white/30 text-center py-6">
                  Sign in to sync AXE chat with your mobile app.
                </div>
              ) : threadError ? (
                <div className="text-[10px] text-red-400/80 text-center py-6">{threadError}</div>
              ) : messages.length === 0 ? (
                <div className="text-[10px] text-white/30 text-center py-6">
                  No messages yet. Start a conversation.
                </div>
              ) : null}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {/* Avatar */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'assistant'
                      ? 'bg-gradient-to-br from-lime-400/20 to-purple-500/20 border border-purple-500/20'
                      : 'bg-white/[0.06] border border-white/[0.08]'
                  }`}>
                    {msg.role === 'assistant'
                      ? <Bot size={12} className="text-purple-400" />
                      : <User size={12} className="text-white/50" />
                    }
                  </div>

                  {/* Message bubble */}
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl text-[11px] leading-relaxed ${
                    msg.role === 'assistant'
                      ? 'bg-white/[0.04] border border-white/[0.06] text-white/70'
                      : 'bg-gradient-to-r from-cyan-500/15 to-purple-500/10 border border-cyan-500/15 text-white/80'
                  }`}>
                    {msg.content}
                    <div className={`text-[8px] mt-1 ${msg.role === 'assistant' ? 'text-white/25' : 'text-white/30'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex justify-center pt-2">
                <div className="text-center">
                  <div className="text-[9px] text-white/20 mb-1">AXE chat sync: messages stored in Supabase</div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[8px] bg-white/[0.03] text-white/20 border border-white/[0.04]">Shared Memory</span>
                    <span className="px-2 py-0.5 rounded text-[8px] bg-white/[0.03] text-white/20 border border-white/[0.04]">Mobile + Terminal</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Input area */}
            <div className="px-3 py-2.5 border-t border-white/[0.06] chat-no-drag">
              <div className="flex items-center gap-1.5">
                {/* Attachment button */}
                <button
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all shrink-0"
                  title="Attach file"
                  onClick={() => {/* TODO: File attachment */}}
                >
                  <Paperclip size={14} />
                </button>
                {/* Voice button */}
                <button
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all shrink-0"
                  title="Voice message"
                  onClick={() => {/* TODO: Voice input */}}
                >
                  <Mic size={14} />
                </button>
                {/* Text input */}
                <div className="flex-1 flex items-center px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] focus-within:border-purple-500/30 transition-colors">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask your AI trading assistant..."
                    className="flex-1 bg-transparent text-[11px] text-white/70 placeholder:text-white/20 outline-none"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  />
                </div>
                {/* Send button */}
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-r from-lime-500/20 to-purple-500/20 border border-purple-500/20 text-purple-400 hover:from-lime-500/30 hover:to-purple-500/30 transition-all shrink-0"
                  onClick={handleSend}
                >
                  <Send size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[8px] text-white/15">Powered by AXE AI Engine</span>
                <div className="flex items-center gap-1">
                  <Lock size={7} className="text-emerald-400/40" />
                  <span className="text-[8px] text-emerald-400/40">TLS 1.3 Encrypted</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ Resize handle ═══ */}
        {!isMinimized && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize chat-no-drag"
            onMouseDown={handleResizeStart}
            title="Resize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-white/20">
              <path d="M1 9L9 1M4 9L9 4" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
