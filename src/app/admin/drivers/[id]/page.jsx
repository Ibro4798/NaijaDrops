"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, ShieldCheck, ShieldAlert, FileText, 
  CheckCircle2, XCircle, Mail, MapPin, Truck, MessageCircle, Send
} from 'lucide-react';

export default function DriverReviewPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [driver, setDriver] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!params.id) return;

    async function fetchData() {
      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', params.id)
        .single();
      
      if (profile) setDriver(profile);

      // Fetch documents
      const { data: driverDocs } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('driver_id', params.id);
      
      if (driverDocs) setDocs(driverDocs);
      setLoading(false);
    }
    fetchData();
  }, [params.id, supabase]);

  const sendNotification = async (title, message) => {
    await supabase.from('notifications').insert({
      user_id: params.id,
      title,
      message
    });
  };

  const handleUpdateStatus = async (newStatus, verifyBool = null) => {
    setActionLoading(true);
    try {
      const updates = { driver_status: newStatus };
      if (verifyBool !== null) updates.is_verified = verifyBool;

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', params.id);

      if (error) throw error;
      
      setDriver(prev => ({ ...prev, ...updates }));
      
      // Notify driver
      let msg = `Your application status has been updated to: ${newStatus.toUpperCase()}.`;
      if (newStatus === 'active') msg = "Congratulations! Your driver application has been approved. You can now go online and start accepting orders.";
      if (newStatus === 'paused') msg = "Your account has been temporarily paused by an administrator. Please contact support for more details.";
      if (newStatus === 'rejected') msg = "We regret to inform you that your driver application has been rejected at this time.";
      
      await sendNotification("Application Update", msg);
      
      alert(`Driver status updated to ${newStatus}`);
    } catch (err) {
      console.error(err);
      alert('Action failed: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateDocStatus = async (docId, newStatus, reason = '') => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('driver_documents')
        .update({ status: newStatus, rejection_reason: reason })
        .eq('id', docId);

      if (error) throw error;
      
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: newStatus, rejection_reason: reason } : d));
      
      if (newStatus === 'rejected') {
        const doc = docs.find(d => d.id === docId);
        await sendNotification("Document Rejected", `Your ${doc.doc_type.replace('_', ' ')} was rejected. Reason: ${reason}. Please re-upload a clear photo.`);
      } else {
        await sendNotification("Document Approved", `Your ${docs.find(d => d.id === docId).doc_type.replace('_', ' ')} has been approved.`);
      }
      
      alert(`Document ${newStatus}`);
    } catch (err) {
      console.error(err);
      alert('Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleScheduleInspection = async () => {
    setActionLoading(true);
    try {
      const msg = `Your vehicle inspection has been scheduled. An administrator will contact you at ${driver.phone} or via email shortly to confirm the time and location.`;
      await sendNotification("Inspection Scheduled", msg);
      alert("Inspection invitation sent via app notification and logged for email dispatch.");
    } catch (err) {
      console.error(err);
      alert("Failed to schedule inspection.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ admin_notes: driver.admin_notes })
        .eq('id', params.id);
      if (error) throw error;
      alert('Notes saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save notes.');
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Loading credentials...</div>;
  if (!driver) return <div className="p-10 text-center">Driver not found.</div>;

  const statusColors = {
    active: 'bg-emerald-500/10 text-emerald-500',
    pending: 'bg-amber-500/10 text-amber-500',
    paused: 'bg-blue-500/10 text-blue-500',
    rejected: 'bg-red-500/10 text-red-500'
  };

  return (
    <div className="max-w-4xl pb-20">
      <button 
        onClick={() => router.push('/admin/drivers')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 font-bold text-sm"
      >
        <ArrowLeft size={18} /> Back to Drivers
      </button>

      <div className="flex justify-between items-start mb-10 overflow-x-auto gap-4">
        <div className="flex items-center gap-6 min-w-fit">
          <div className="w-24 h-24 bg-charcoal-800 rounded-3xl flex items-center justify-center text-4xl font-black text-emerald-500 border border-charcoal-700">
            {driver.full_name?.[0]}
          </div>
          <div>
            <h1 className="text-4xl font-black mb-2">{driver.full_name}</h1>
            <div className="flex flex-col gap-1 text-gray-400 font-medium">
              <span className="flex items-center gap-1.5"><Mail size={16} /> {driver.email || 'No email stored'}</span>
              <div className="flex items-center gap-4">
                  <span className="text-sm">📞 {driver.phone}</span>
                  <span className="text-sm text-emerald-500">💬 {driver.whatsapp_number || 'No WhatsApp'}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
                 <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${statusColors[driver.driver_status || 'pending']}`}>
                    {driver.driver_status || 'pending'}
                 </span>
                 <span className="px-3 py-1 bg-charcoal-800 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest">ID: {driver.id.slice(0,8)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-fit">
          <div className="flex gap-3">
            <button 
              onClick={() => handleUpdateStatus('active', true)}
              disabled={actionLoading || driver.driver_status === 'active'}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-charcoal-900 font-black rounded-2xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <ShieldCheck size={20} /> Approve
            </button>
            <button 
              onClick={() => handleUpdateStatus('paused', false)}
              disabled={actionLoading || driver.driver_status === 'paused'}
              className="px-6 py-3 bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20 font-black rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <ShieldAlert size={20} /> Pause
            </button>
            <button 
              onClick={() => handleUpdateStatus('rejected', false)}
              disabled={actionLoading || driver.driver_status === 'rejected'}
              className="px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 font-black rounded-2xl flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <XCircle size={20} /> Reject
            </button>
          </div>
        </div>
      </div>

      <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2rem] p-6 mb-8">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Admin Internal Notes</h3>
          <textarea 
            value={driver.admin_notes || ''}
            onChange={(e) => setDriver(prev => ({ ...prev, admin_notes: e.target.value }))}
            placeholder="Add internal notes about this driver (e.g. background check details, inspection results)..."
            className="w-full bg-charcoal-800 border border-charcoal-700 rounded-xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[100px] mb-4"
          />
          <button 
            onClick={handleSaveNotes}
            className="px-6 py-2 bg-charcoal-700 text-white text-xs font-black rounded-lg hover:bg-charcoal-600 transition-all uppercase tracking-widest"
          >
            Save Internal Notes
          </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Documents Section */}
        <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8">
            <h2 className="text-xl font-black mb-6 flex items-center gap-2">
                <FileText className="text-emerald-500" /> Uploaded Documents
            </h2>
            
            {docs.length === 0 ? (
                <div className="text-center py-10 text-gray-500 italic font-medium">No documents uploaded yet.</div>
            ) : (
                <div className="space-y-4">
                    {docs.map(doc => (
                        <div key={doc.id} className="bg-charcoal-800 p-4 rounded-2xl border border-charcoal-700">
                            <div className="flex justify-between items-start mb-3">
                                <div className="font-bold text-sm uppercase tracking-wider">{doc.doc_type.replace('_', ' ')}</div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${doc.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' : doc.status === 'rejected' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                                    {doc.status}
                                </span>
                            </div>
                            <img src={doc.file_url} alt={doc.doc_type} className="w-full h-48 object-cover rounded-xl mb-4 bg-black" />
                            
                            {doc.rejection_reason && (
                                <div className="mb-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-[10px] text-red-400 font-medium">
                                    <span className="font-black">REJECTION REASON:</span> {doc.rejection_reason}
                                </div>
                            )}

                            <div className="flex flex-col gap-3">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleUpdateDocStatus(doc.id, 'approved')}
                                        disabled={actionLoading || doc.status === 'approved'}
                                        className="flex-1 py-2 bg-emerald-500/10 text-emerald-500 text-xs font-bold rounded-lg hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                                    >
                                        Approve
                                    </button>
                                    <button 
                                        onClick={() => {
                                            const reason = prompt("Reason for rejection:");
                                            if (reason) handleUpdateDocStatus(doc.id, 'rejected', reason);
                                        }}
                                        disabled={actionLoading}
                                        className="flex-1 py-2 bg-red-500/10 text-red-500 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Vehicle & Inspection Section */}
        <div className="space-y-8">
            <div className="bg-charcoal-800/20 border border-charcoal-800 rounded-[2.5rem] p-8">
                <h2 className="text-xl font-black mb-6 flex items-center gap-2">
                    <Truck className="text-emerald-500" /> Vehicle Information
                </h2>
                <div className="space-y-4">
                    <div className="flex justify-between border-b border-charcoal-800 pb-3">
                        <span className="text-gray-400 font-medium">Vehicle Type</span>
                        <span className="font-bold">{driver.vehicle_type || '---'}</span>
                    </div>
                    <div className="flex justify-between border-b border-charcoal-800 pb-3">
                        <span className="text-gray-400 font-medium">Plate Number</span>
                        <span className="font-bold uppercase">{driver.plate_number || '---'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400 font-medium">Insurance Status</span>
                        <span className="text-amber-500 font-bold">Pending Review</span>
                    </div>
                </div>
            </div>

            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[2.5rem] p-8">
                <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                    <CheckCircle2 className="text-emerald-500" /> Vehicle Inspection
                </h2>
                <p className="text-sm text-gray-400 mb-6 font-medium leading-relaxed">
                    Once documents are preliminarily approved, schedule a physical inspection to verify the vehicle condition.
                </p>
                <button 
                    onClick={handleScheduleInspection}
                    disabled={actionLoading}
                    className="w-full py-4 bg-emerald-500 text-charcoal-900 font-black rounded-2xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    <Send size={18} /> Schedule Inspection
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
