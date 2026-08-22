"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Send, X, AlertCircle, Check, ChevronDown, Lock, HandCoins } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Channel-aware 3-way chat: vendor sees Rider/Customer tabs, rider sees
// Vendor/Customer, customer sees Vendor/Rider (once assigned).
const CHANNELS_BY_ROLE = {
  vendor:   [{ key: 'vendor_rider',    label: 'Rider',    needsRider: true },  { key: 'vendor_customer', label: 'Customer', needsRider: false }],
  rider:    [{ key: 'vendor_rider',    label: 'Vendor',   needsRider: false }, { key: 'rider_customer',  label: 'Customer', needsRider: false }],
  customer: [{ key: 'vendor_customer', label: 'Vendor',   needsRider: false }, { key: 'rider_customer',  label: 'Rider',    needsRider: true }],
};

const ANON_POLL_MS = 7000;

export default function OrderChat({
  orderId,
  currentUserId = null,
  viewerRole = 'vendor',       // 'vendor' | 'rider' | 'customer'
  riderAssigned = true,
  onClose,
  isReadOnly = false,
  onPriceUpdated,
  initialChannel = null,
}) {
  const supabase = createClient();
  const isAnonymous = viewerRole === 'customer';

  const availableChannels = (CHANNELS_BY_ROLE[viewerRole] || CHANNELS_BY_ROLE.vendor)
    .filter(c => !c.needsRider || riderAssigned);

  const [activeChannel, setActiveChannel] = useState(() => {
    if (initialChannel && availableChannels.some(c => c.key === initialChannel)) return initialChannel;
    return availableChannels[0]?.key || 'vendor_rider';
  });
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [unread, setUnread] = useState({});
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [showPriceNegotiate, setShowPriceNegotiate] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [isPriceUpdating, setIsPriceUpdating] = useState(false);
  const [offerSentSuccess, setOfferSentSuccess] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);
  const pollRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // --- Authenticated vendor/rider: load all channels for this order at once
  // and group client-side. Subscribes to both INSERT (new messages) and
  // UPDATE (an offer being accepted/declined flips offer_status on an
  // EXISTING message row, rather than creating a new one). ---
  useEffect(() => {
    if (isAnonymous) return;
    let cancelled = false;

    const load = async () => {
      const { data: orderData } = await supabase
        .from('orders')
        .select('agreed_price, status, payment_status, price_locked, vendor_id, rider_id')
        .eq('id', orderId)
        .single();
      if (!cancelled && orderData) setOrder(orderData);

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (error) {
        setError('Could not load messages. Check your connection.');
      } else {
        const grouped = {};
        (data || []).forEach(m => {
          const ch = m.channel || 'vendor_rider';
          (grouped[ch] = grouped[ch] || []).push(m);
        });
        setMessagesByChannel(grouped);
      }
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    };
    load();

    subscriptionRef.current = supabase
      .channel(`chat-${orderId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, (payload) => {
        const msg = payload.new;
        const ch = msg.channel || 'vendor_rider';
        // FIX: this was appending every INSERT unconditionally, including
        // realtime's echo of messages THIS client just sent - which had
        // already been added to state optimistically a moment earlier in
        // handleSendMessage/handleSendOffer (with a different, client-only
        // id). Result: the sender's own message rendered twice. The other
        // party isn't affected - they never had an optimistic copy, so
        // their only copy is this real one.
        if (msg.sender_id === currentUserId) return;
        setMessagesByChannel(prev => ({ ...prev, [ch]: [...(prev[ch] || []), msg] }));
        if (ch === activeChannelRef.current) {
          setTimeout(scrollToBottom, 100);
        } else {
          setUnread(u => ({ ...u, [ch]: (u[ch] || 0) + 1 }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` }, (payload) => {
        const msg = payload.new;
        const ch = msg.channel || 'vendor_rider';
        setMessagesByChannel(prev => ({
          ...prev,
          [ch]: (prev[ch] || []).map(m => m.id === msg.id ? msg : m),
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, (payload) => {
        if (payload.new.agreed_price !== payload.old.agreed_price) {
          setOrder(prev => ({ ...prev, agreed_price: payload.new.agreed_price }));
          onPriceUpdated?.(payload.new.agreed_price);
        }
        if (payload.new.payment_status !== payload.old.payment_status) {
          setOrder(prev => ({ ...prev, payment_status: payload.new.payment_status }));
        }
        if (payload.new.price_locked !== payload.old.price_locked) {
          setOrder(prev => ({ ...prev, price_locked: payload.new.price_locked }));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, supabase, isAnonymous]);

  // --- Anonymous customer: fetch + poll the active channel via the
  // service-role API route (never sees vendor_rider, so never sees offers). ---
  const fetchAnonMessages = useCallback(async (channel, { silent } = {}) => {
    try {
      const res = await fetch(`/api/track/${orderId}/messages?channel=${channel}`);
      const json = await res.json();
      if (!res.ok || !json.success) return;
      setMessagesByChannel(prev => {
        const prevList = prev[channel] || [];
        const newList = json.messages || [];
        if (newList.length === prevList.length && silent) return prev;
        if (silent && newList.length > prevList.length && channel !== activeChannelRef.current) {
          setUnread(u => ({ ...u, [channel]: (u[channel] || 0) + (newList.length - prevList.length) }));
        }
        return { ...prev, [channel]: newList };
      });
    } catch {
      // transient network issue - next poll tries again
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!isAnonymous) return;
    setLoading(true);
    fetchAnonMessages(activeChannel);
    setUnread(u => ({ ...u, [activeChannel]: 0 }));
    pollRef.current = setInterval(() => fetchAnonMessages(activeChannel, { silent: true }), ANON_POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [isAnonymous, activeChannel, fetchAnonMessages]);

  useEffect(() => {
    setTimeout(scrollToBottom, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesByChannel[activeChannel]?.length]);

  const handleTabChange = (key) => {
    setActiveChannel(key);
    setUnread(u => ({ ...u, [key]: 0 }));
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');
    inputRef.current?.focus();

    if (isAnonymous) {
      const tempMsg = { id: crypto.randomUUID(), sender_role: 'customer', channel: activeChannel, text, created_at: new Date().toISOString(), type: 'text' };
      setMessagesByChannel(prev => ({ ...prev, [activeChannel]: [...(prev[activeChannel] || []), tempMsg] }));
      scrollToBottom();
      try {
        const res = await fetch(`/api/track/${orderId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: activeChannel, text }),
        });
        if (!res.ok) throw new Error('send failed');
        fetchAnonMessages(activeChannel);
      } catch {
        setError('Failed to send message.');
      }
      return;
    }

    const tempMsg = { id: crypto.randomUUID(), order_id: orderId, sender_id: currentUserId, sender_role: viewerRole, channel: activeChannel, text, created_at: new Date().toISOString(), type: 'text' };
    setMessagesByChannel(prev => ({ ...prev, [activeChannel]: [...(prev[activeChannel] || []), tempMsg] }));
    scrollToBottom();

    const { error } = await supabase.from('messages').insert({
      order_id: orderId,
      sender_id: currentUserId,
      sender_role: viewerRole,
      channel: activeChannel,
      text,
      type: 'text',
    });

    if (error) {
      setError('Failed to send message.');
      setMessagesByChannel(prev => ({ ...prev, [activeChannel]: (prev[activeChannel] || []).filter(m => m.id !== tempMsg.id) }));
    }
  };

  // FIX: this used to write orders.agreed_price directly the moment
  // EITHER side tapped Confirm - the "negotiation" was really just one
  // person unilaterally changing the price. Now it only ever posts a
  // price_offer message with offer_status='pending'; agreed_price never
  // moves until the OTHER party explicitly accepts it (see
  // handleRespondToOffer below and the respond_to_price_offer DB function,
  // which is the only thing allowed to touch agreed_price for a
  // negotiation and enforces server-side that the accepter isn't the
  // proposer).
  const handleSendOffer = async () => {
    const priceNum = Number(newPrice);
    if (!priceNum || priceNum < 100) {
      setError('Price must be at least ₦100');
      return;
    }
    setIsPriceUpdating(true);
    setError('');
    try {
      const tempMsg = {
        id: crypto.randomUUID(), order_id: orderId, sender_id: currentUserId, sender_role: viewerRole,
        channel: 'vendor_rider', type: 'price_offer', offer_amount: priceNum, offer_status: 'pending',
        text: `Proposed ₦${priceNum.toLocaleString()}`, created_at: new Date().toISOString(),
      };
      setMessagesByChannel(prev => ({ ...prev, vendor_rider: [...(prev.vendor_rider || []), tempMsg] }));

      const { error: insertErr } = await supabase.from('messages').insert({
        order_id: orderId,
        sender_id: currentUserId,
        sender_role: viewerRole,
        channel: 'vendor_rider',
        type: 'price_offer',
        offer_amount: priceNum,
        offer_status: 'pending',
        text: `Proposed ₦${priceNum.toLocaleString()}`,
      });
      if (insertErr) throw insertErr;

      setOfferSentSuccess(true);
      setTimeout(() => { setOfferSentSuccess(false); setShowPriceNegotiate(false); setNewPrice(''); }, 1600);
      if (activeChannel === 'vendor_rider') setTimeout(scrollToBottom, 150);
    } catch (err) {
      setError('Failed to send offer: ' + err.message);
    } finally {
      setIsPriceUpdating(false);
    }
  };

  const handleRespondToOffer = async (messageId, accept) => {
    setRespondingId(messageId);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('respond_to_price_offer', {
        p_message_id: messageId,
        p_accept: accept,
      });
      if (rpcErr) throw rpcErr;

      setMessagesByChannel(prev => ({
        ...prev,
        vendor_rider: (prev.vendor_rider || []).map(m => m.id === messageId ? { ...m, offer_status: accept ? 'accepted' : 'declined' } : m),
      }));

      if (accept) {
        const acceptedMsg = (messagesByChannel.vendor_rider || []).find(m => m.id === messageId);
        if (acceptedMsg) {
          setOrder(prev => ({ ...prev, agreed_price: acceptedMsg.offer_amount, price_locked: true }));
          onPriceUpdated?.(acceptedMsg.offer_amount);
        }
      }
    } catch (err) {
      setError(err.message || 'Could not respond to this offer - it may no longer be valid.');
    } finally {
      setRespondingId(null);
    }
  };

  // Negotiation only ever applies to the vendor<->rider thread and is
  // available to whichever of vendor/rider currently has that tab open.
  // FIX: this used to only ever lock once payment cleared, so a vendor and
  // rider could keep "renegotiating" indefinitely even after they'd
  // already agreed on a number moments earlier via chat, or even after
  // that exact number came from the vendor accepting a rider's bid in the
  // first place. Once price_locked is set (see the accept_bid and
  // respond_to_price_offer DB functions - both flip it the instant a real
  // agreement happens), negotiation closes for the rest of the order.
  const onVendorRiderTab = activeChannel === 'vendor_rider';
  const priceIsFinal = order?.price_locked || order?.payment_status === 'paid';
  const canNegotiatePrice = !isAnonymous && onVendorRiderTab && order && !priceIsFinal && order.status !== 'delivered' && order.status !== 'cancelled';
  const priceLockedByPayment = onVendorRiderTab && order?.payment_status === 'paid' && order.status !== 'delivered' && order.status !== 'cancelled';
  const priceLockedByAgreement = onVendorRiderTab && order?.price_locked && order.payment_status !== 'paid';

  // type='system_ephemeral' rows exist purely to trigger the global
  // ChatNotificationListener toast (it listens to ALL messages INSERTs) -
  // they're not meant to sit in the conversation history itself.
  const messages = (messagesByChannel[activeChannel] || []).filter(m => m.type !== 'system_ephemeral');
  const currentTabLabel = availableChannels.find(c => c.key === activeChannel)?.label || 'Chat';

  // Only the most recent still-pending offer gets action buttons - older
  // pending offers (superseded by a newer proposal) are shown as inert
  // history rather than something that can still be independently accepted.
  const latestPendingOffer = onVendorRiderTab
    ? [...messages].reverse().find(m => m.type === 'price_offer' && m.offer_status === 'pending')
    : null;
  const latestPendingOfferId = latestPendingOffer?.id || null;

  // FIX: the header always showed order.agreed_price, even while a newer
  // offer was sitting pending in the thread below it - so the "current
  // price" everyone saw at a glance was stale the moment either side
  // proposed something new. This shows whatever's actually on the table
  // right now: the pending offer if there is one, otherwise the real
  // agreed price.
  const displayedAmount = latestPendingOffer ? latestPendingOffer.offer_amount : order?.agreed_price;
  const showingPendingAmount = !!latestPendingOffer;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col glass-dark sm:inset-auto sm:bottom-0 sm:left-0 sm:right-0 sm:rounded-t-[2.5rem] sm:max-h-[85vh] shadow-premium sm:border-t sm:border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shrink-0">
            <Send size={18} className="text-emerald-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-white text-base font-outfit uppercase tracking-tighter italic truncate">Chat · {currentTabLabel}</h3>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">#{orderId.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isAnonymous && onVendorRiderTab && order && (
            <button
              onClick={() => canNegotiatePrice && setShowPriceNegotiate(v => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                canNegotiatePrice
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 active:scale-95'
                  : showingPendingAmount
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 cursor-default'
                  : 'bg-white/5 border-white/5 text-gray-500 cursor-default'
              }`}
              title={
                canNegotiatePrice ? 'Tap to propose a new price'
                : priceLockedByPayment ? 'Payment already confirmed - price is locked'
                : priceLockedByAgreement ? 'A price has already been agreed - negotiation is closed'
                : 'Order complete'
              }
            >
              <span className="font-black text-xs">₦{displayedAmount?.toLocaleString()}</span>
              {showingPendingAmount && !canNegotiatePrice ? null : canNegotiatePrice ? (
                <ChevronDown size={14} className={`transition-transform ${showPriceNegotiate ? 'rotate-180' : ''}`} />
              ) : (priceLockedByPayment || priceLockedByAgreement) ? (
                <Lock size={12} />
              ) : null}
            </button>
          )}
          <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/5">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Channel tabs */}
      {availableChannels.length > 1 && (
        <div className="flex gap-2 px-5 pt-3 shrink-0">
          {availableChannels.map(c => (
            <button
              key={c.key}
              onClick={() => handleTabChange(c.key)}
              className={`relative flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeChannel === c.key ? 'bg-emerald-500 text-charcoal-950' : 'bg-white/5 text-charcoal-400 hover:bg-white/10'}`}
            >
              {c.label}
              {unread[c.key] > 0 && c.key !== activeChannel && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {unread[c.key] > 9 ? '9+' : unread[c.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Propose-offer panel - sends a pending offer, does NOT touch agreed_price */}
      <AnimatePresence>
        {showPriceNegotiate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-white/10 bg-charcoal-900/90 shrink-0"
          >
            <div className="p-5">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mb-4">Propose a New Price</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-black text-lg">₦</span>
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
                  onClick={handleSendOffer}
                  disabled={isPriceUpdating || !newPrice || offerSentSuccess}
                  className={`px-6 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-40 flex items-center gap-2 ${offerSentSuccess ? 'bg-emerald-500 text-charcoal-950' : 'bg-white text-charcoal-950 hover:bg-emerald-400'}`}
                >
                  {isPriceUpdating ? (
                    <div className="w-4 h-4 border-2 border-charcoal-950 border-t-transparent rounded-full animate-spin" />
                  ) : offerSentSuccess ? (
                    <><Check size={16} /> Sent!</>
                  ) : 'Send Offer'}
                </button>
              </div>
              <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest mt-3 pl-px">
                Nothing changes until the other side accepts this offer in chat.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-charcoal-900/40">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 font-black text-xs uppercase tracking-widest animate-pulse">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 space-y-3">
            <div className="w-16 h-16 bg-white/5 rounded-[2rem] flex items-center justify-center border border-white/5">
              <AlertCircle size={28} className="opacity-30" />
            </div>
            <p className="font-black text-sm text-white/20 uppercase tracking-widest">No messages yet</p>
            <p className="text-[10px] text-white/10 font-bold uppercase tracking-[0.2em] max-w-[200px] leading-relaxed">
              Send a message to coordinate with the {currentTabLabel.toLowerCase()}
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = isAnonymous ? msg.sender_role === 'customer' : msg.sender_id === currentUserId;
            const isSystem = msg.type === 'system';
            const isOffer = msg.type === 'price_offer';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black px-5 py-2 rounded-full uppercase tracking-widest text-center max-w-[85%]">
                    {msg.text}
                  </div>
                </div>
              );
            }

            if (isOffer) {
              const canRespond = !isMe && msg.offer_status === 'pending' && msg.id === latestPendingOfferId && canNegotiatePrice;
              const statusLabel = msg.offer_status === 'accepted' ? 'Accepted' : msg.offer_status === 'declined' ? 'Declined' : (isMe ? 'Waiting for response' : 'Awaiting your response');
              const statusColor = msg.offer_status === 'accepted' ? 'text-emerald-400' : msg.offer_status === 'declined' ? 'text-red-400' : 'text-amber-400';
              return (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-[1.5rem] px-5 py-4 border ${isMe ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-charcoal-800 border-white/10'}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <HandCoins size={14} className="text-emerald-500" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Price offer</span>
                    </div>
                    <p className="text-xl font-black text-white font-outfit">₦{Number(msg.offer_amount).toLocaleString()}</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest mt-1 ${statusColor}`}>{statusLabel}</p>
                    {canRespond && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleRespondToOffer(msg.id, true)}
                          disabled={respondingId === msg.id}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-charcoal-950 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {respondingId === msg.id ? <div className="w-3.5 h-3.5 border-2 border-charcoal-950 border-t-transparent rounded-full animate-spin" /> : <><Check size={13} /> Accept</>}
                        </button>
                        <button
                          onClick={() => handleRespondToOffer(msg.id, false)}
                          disabled={respondingId === msg.id}
                          className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    <span className={`text-[9px] font-bold mt-2 block ${isMe ? 'text-emerald-100/50' : 'text-gray-600'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
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
              placeholder={`Message ${currentTabLabel.toLowerCase()}...`}
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
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em]">Order Completed • Channel Sealed</p>
        </div>
      )}
    </div>
  );
}
