"use client";

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Send, X, AlertCircle, DollarSign, Check, ChevronDown, Mic, Play, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function OrderChat({ orderId, currentUserId, onClose, isReadOnly = false, onPriceUpdated }) {
  const supabase = createClient();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [showPriceNegotiate, setShowPriceNegotiate] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [isPriceUpdating, setIsPriceUpdating] = useState(false);
  const [priceUpdateSuccess, setPriceUpdateSuccess] = useState(false);
  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const fetchOrderAndMessages = async () => {
      // Fetch order details to show current agreed price
      const { data: orderData } = await supabase
        .from('orders')
        .select('agreed_price, status, vendor_id, rider_id')
        .eq('id', orderId)
        .single();
      if (orderData) setOrder(orderData);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) {
        setError("Could not load messages. Check your connection.");
      } else {
        setMessages(data || []);
      }
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    };

    fetchOrderAndMessages();

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
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      }, (payload) => {
        if (payload.new.agreed_price !== payload.old.agreed_price) {
          setOrder(prev => ({ ...prev, agreed_price: payload.new.agreed_price }));
          onPriceUpdated?.(payload.new.agreed_price);
        }
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
    e?.preventDefault();
    if (!newMessage.trim()) return;

    const tempMsg = {
      id: crypto.randomUUID(),
      order_id: orderId,
      sender_id: currentUserId,
      text: newMessage.trim(),
      created_at: new Date().toISOString(),
      type: 'text'
    };

    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');
    scrollToBottom();
    inputRef.current?.focus();

    const { error } = await supabase.from('messages').insert({
      order_id: orderId,
      sender_id: currentUserId,
      text: tempMsg.text,
      type: 'text'
    });

    if (error) {
      setError("Failed to send message.");
      setMessages(prev => prev.filter(msg => msg.id !== tempMsg.id));
    }
  };

  const handleUpdatePrice = async () => {
    const priceNum = Number(newPrice);
    if (!priceNum || priceNum < 100) {
      setError('Price must be at least â‚¦100');
      return;
    }

    setIsPriceUpdating(true);
    try {
      // 1. Update the order's agreed price
      const { error: updateErr } = await supabase
        .from('orders')
        .update({ agreed_price: priceNum })
        .eq('id', orderId);

      if (updateErr) throw updateErr;

      // 2. Post a system message in the chat log
      await supabase.from('messages').insert({
        order_id: orderId,
        sender_id: currentUserId,
        text: `ðŸ’° Price updated to â‚¦${priceNum.toLocaleString()} (agreed via chat)`,
        type: 'system'
      });

      setOrder(prev => ({ ...prev, agreed_price: priceNum }));
      onPriceUpdated?.(priceNum);
      setPriceUpdateSuccess(true);
      setTimeout(() => {
        setPriceUpdateSuccess(false);
        setShowPriceNegotiate(false);
        setNewPrice('');
      }, 2000);
    } catch (err) {
      setError('Failed to update price: ' + err.message);
    } finally {
      setIsPriceUpdating(false);
    }
  };

  const canNegotiatePrice = order && order.status !== 'delivered' && order.status !== 'cancelled';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col glass-dark sm:inset-auto sm:bottom-0 sm:left-0 sm:right-0 sm:rounded-t-[2.5rem] sm:max-h-[85vh] shadow-premium sm:border-t sm:border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Send size={18} className="text-emerald-500" />
          </div>
          <div>
            <h3 className="font-black text-white text-base font-outfit uppercase tracking-tighter italic">Order Chat</h3>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">#{orderId.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Current Price Badge */}
          {order && (
            <button
              onClick={() => canNegotiatePrice && setShowPriceNegotiate(v => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${canNegotiatePrice ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 active:scale-95' : 'bg-white/5 border-white/5 text-gray-500 cursor-default'}`}
              title={canNegotiatePrice ? "Tap to negotiate price" : "Order complete"}
            >
              <span className="font-black text-xs">â‚¦{order.agreed_price?.toLocaleString()}</span>
              {canNegotiatePrice && <ChevronDown size={14} className={`transition-transform ${showPriceNegotiate ? 'rotate-180' : ''}`} />}
            </button>
          )}
          <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/5">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Price Negotiation Panel */}
      <AnimatePresence>
        {showPriceNegotiate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/10 bg-charcoal-900/90 shrink-0"
          >
            <div className="p-5">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Propose New Agreed Price</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-black text-lg">â‚¦</span>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    placeholder={order?.agreed_price?.toString()}
                    className="w-full pl-10 pr-4 py-3.5 bg-charcoal-950 border border-white/10 rounded-2xl text-white font-black focus:outline-none focus:border-emerald-500 transition-all"
                    inputMode="numeric"
                  />
                </div>
                <button
                  onClick={handleUpdatePrice}
                  disabled={isPriceUpdating || !newPrice || priceUpdateSuccess}
                  className={`px-6 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-2 ${priceUpdateSuccess ? 'bg-emerald-500 text-charcoal-950' : 'bg-white text-charcoal-950 hover:bg-emerald-400'}`}
                >
                  {isPriceUpdating ? (
                    <div className="w-4 h-4 border-2 border-charcoal-950 border-t-transparent rounded-full animate-spin" />
                  ) : priceUpdateSuccess ? (
                    <><Check size={16} /> Done!</>
                  ) : 'Confirm'}
                </button>
              </div>
              <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-3">
                Both parties will be notified. This updates the final agreed payment.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-charcoal-900/40">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 font-black text-xs uppercase tracking-widest animate-pulse">
            Synchronizing transmission...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 space-y-3">
            <div className="w-16 h-16 bg-white/5 rounded-[2rem] flex items-center justify-center border border-white/5">
              <AlertCircle size={28} className="opacity-30" />
            </div>
            <p className="font-black text-sm text-white/20 uppercase tracking-widest">No transmissions yet</p>
            <p className="text-[10px] text-white/10 font-bold uppercase tracking-[0.2em] max-w-[200px] leading-relaxed">
              Send a message to coordinate with your counterparty
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === currentUserId;
            const isSystem = msg.type === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black px-5 py-2 rounded-full uppercase tracking-widest">
                    {msg.text}
                  </div>
                </div>
              );
            }

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[78%] rounded-[1.5rem] px-5 py-3.5 shadow-sm ${
                    isMe
                    ? 'bg-emerald-500 text-white rounded-tr-md'
                    : 'bg-charcoal-800 text-gray-200 rounded-tl-md border border-white/5'
                  }`}
                >
                  <p className="text-sm font-semibold leading-relaxed">{msg.text}</p>
                  <span className={`text-[9px] font-bold mt-1.5 block ${isMe ? 'text-emerald-100/70' : 'text-gray-600'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-center">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {!isReadOnly ? (
        <div className="p-4 bg-charcoal-900/90 backdrop-blur-md border-t border-white/10 shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <form onSubmit={handleSendMessage} className="flex items-center gap-3">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Send a message..."
              className="flex-1 bg-charcoal-800 text-white placeholder:text-gray-600 px-5 py-3.5 rounded-2xl border border-white/5 focus:outline-none focus:border-emerald-500 transition-colors font-medium text-sm"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="w-12 h-12 bg-emerald-500 hover:bg-emerald-400 disabled:bg-charcoal-800 disabled:opacity-30 text-white rounded-2xl flex items-center justify-center transition-all shadow-glow disabled:shadow-none active:scale-95"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
        </div>
      ) : (
        <div className="p-6 bg-charcoal-800/50 border-t border-white/5 text-center shrink-0">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em]">Order Completed â€¢ Channel Sealed</p>
        </div>
      )}
    </div>
  );
}
