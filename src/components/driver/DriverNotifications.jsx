"use client";

import { useState, useEffect } from 'react';
import { Bell, X, CheckSquare, AlertCircle, Info, Send } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

export default function DriverNotifications({ userId }) {
    const supabase = createClient();
    const [notifications, setNotifications] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!userId) return;

        async function fetchNotifications() {
            const { data } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            
            if (data) {
                setNotifications(data);
                setUnreadCount(data.filter(n => !n.is_read).length);
            }
        }

        fetchNotifications();

        // Subscribe to new notifications
        const channel = supabase.channel(`notifications:${userId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'notifications',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                setNotifications(prev => [payload.new, ...prev]);
                setUnreadCount(prev => prev + 1);
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [userId, supabase]);

    const markAsRead = async (id) => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);
        
        if (!error) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : d));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const markAllRead = async () => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userId)
            .eq('is_read', false);
        
        if (!error) {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        }
    };

    return (
        <div className="relative">
            <button 
                onClick={() => setShowDropdown(!showDropdown)}
                className="relative p-2 text-gray-400 hover:text-white hover:bg-charcoal-800 rounded-xl transition-all"
            >
                <Bell size={22} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-[10px] font-black text-charcoal-900 rounded-full flex items-center justify-center border-2 border-charcoal-900">
                        {unreadCount}
                    </span>
                )}
            </button>

            {showDropdown && (
                <>
                    <div 
                        className="fixed inset-0 z-40 bg-black/20" 
                        onClick={() => setShowDropdown(false)}
                    />
                    <div className="absolute right-0 mt-3 w-80 bg-charcoal-800 border border-charcoal-700 rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="p-4 border-b border-charcoal-700 flex justify-between items-center">
                            <h3 className="font-black text-sm uppercase tracking-widest text-emerald-500">Notifications</h3>
                            <button onClick={markAllRead} className="text-[10px] font-bold text-gray-400 hover:text-white uppercase tracking-wider">Mark all read</button>
                        </div>
                        
                        <div className="max-h-96 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-10 text-center text-gray-500 font-medium">No notifications yet.</div>
                            ) : (
                                notifications.map(notif => (
                                    <div 
                                        key={notif.id} 
                                        className={`p-4 border-b border-charcoal-700/50 hover:bg-charcoal-700 transition-colors cursor-pointer flex gap-4 ${!notif.is_read ? 'bg-emerald-500/5' : ''}`}
                                        onClick={() => markAsRead(notif.id)}
                                    >
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                            notif.title.includes('Rejected') ? 'bg-red-500/10 text-red-500' :
                                            notif.title.includes('Approved') ? 'bg-emerald-500/10 text-emerald-500' :
                                            'bg-blue-500/10 text-blue-500'
                                        }`}>
                                            {notif.title.includes('Rejected') ? <AlertCircle size={20} /> :
                                             notif.title.includes('Approved') ? <CheckSquare size={20} /> :
                                             notif.title.includes('Inspection') ? <Send size={20} /> : <Info size={20} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-bold text-xs text-white">{notif.title}</span>
                                                <span className="text-[8px] text-gray-500 uppercase font-black">{new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 leading-relaxed">{notif.message}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
