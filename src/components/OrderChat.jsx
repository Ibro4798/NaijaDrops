"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Send, X, AlertCircle } from 'lucide-react';

export default function OrderChat({ orderId, currentUserId, onClose }) {
  const supabase = createClient();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);

  useEffect(() => {
    // 1. Fetch existing messages
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error("Error fetching messages", error);
        setError("Could not load messages. Check your connection.");
      } else {
        setMessages(data || []);
      }
      setLoading(false);
      scrollToBottom();
    };

    fetchMessages();

    // 2. Subscribe to new messages
    subscriptionRef.current = supabase
      .channel(`chat-${orderId}`)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `order_id=eq.${orderId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        setTimeout(scrollToBottom, 100);
      })
      .subscribe();

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [orderId, supabase]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const tempMsg = {
      id: crypto.randomUUID(),
      order_id: orderId,
      sender_id: currentUserId,
      text: newMessage.trim(),
      created_at: new Date().toISOString()
    };

    // Optimistic UI update
    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');
    scrollToBottom();

    // Send to DB
    const { error } = await supabase.from('messages').insert({
      order_id: orderId,
      sender_id: currentUserId,
      text: tempMsg.text
    });

    if (error) {
      console.error("Error sending message", error);
      setError("Failed to send message. Please try again.");
      // Rollback optimistic update
      setMessages(prev => prev.filter(msg => msg.id !== tempMsg.id));
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-charcoal-900 animate-slide-up sm:absolute sm:rounded-t-3xl sm:shadow-2xl sm:top-auto sm:h-[80vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-charcoal-800 bg-charcoal-900 rounded-t-3xl shrink-0">
        <div>
          <h3 className="font-extrabold text-white text-lg">Chat Support</h3>
          <p className="text-xs font-bold text-gray-400">Order #{orderId.slice(0, 8).toUpperCase()}</p>
        </div>
        <button onClick={onClose} className="p-2 bg-charcoal-800 rounded-full text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-charcoal-900/50">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 font-bold animate-pulse">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-2">
            <AlertCircle size={32} className="opacity-50" />
            <p className="font-bold">No messages yet</p>
            <p className="text-xs">Send a message to start a conversation with the counterparty.</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`max-w-[75%] rounded-2xl p-3 ${
                    isMe 
                    ? 'bg-emerald-500 text-white rounded-tr-none' 
                    : 'bg-charcoal-800 text-gray-200 rounded-tl-none border border-charcoal-700'
                  }`}
                >
                  <p className="text-sm font-medium">{msg.text}</p>
                  <span className={`text-[10px] font-bold mt-1 block ${isMe ? 'text-emerald-100' : 'text-gray-500'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center p-2 rounded-lg font-bold">
                {error}
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-charcoal-900 border-t border-charcoal-800 shrink-0">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input 
            type="text" 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..." 
            className="flex-1 bg-charcoal-800 text-white placeholder:text-gray-500 px-4 py-3.5 rounded-2xl border border-charcoal-700 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button 
            type="submit" 
            disabled={!newMessage.trim()}
            className="w-12 h-12 bg-emerald-500 hover:bg-emerald-600 disabled:bg-charcoal-800 text-white rounded-2xl flex items-center justify-center transition-colors shadow-lg disabled:shadow-none"
          >
            <Send size={20} className="ml-1" />
          </button>
        </form>
      </div>
    </div>
  );
}
