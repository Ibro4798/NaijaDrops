"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function FinanceCharts({ data }) {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-charcoal-900 border border-white/10 p-4 rounded-xl shadow-2xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-500 mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-sm font-bold text-blue-500">
              GMV: â‚¦{payload[0]?.value?.toLocaleString()}
            </p>
            <p className="text-sm font-bold text-emerald-500">
              Revenue: â‚¦{payload[1]?.value?.toLocaleString()}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
        <p className="text-[10px] font-black uppercase tracking-widest text-charcoal-600">Awaiting Telemetry Data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <defs>
          <linearGradient id="colorGmv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" strokeOpacity={0.05} vertical={false} />
        <XAxis 
          dataKey="date" 
          stroke="#525252" 
          fontSize={10} 
          tickLine={false} 
          axisLine={false}
          tick={{ fill: '#737373', fontWeight: 900 }}
          dy={10}
        />
        <YAxis 
          stroke="#525252" 
          fontSize={10} 
          tickLine={false} 
          axisLine={false}
          tick={{ fill: '#737373', fontWeight: 900 }}
          tickFormatter={(value) => `â‚¦${value.toLocaleString()}`}
          dx={-10}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#ffffff', strokeOpacity: 0.1, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="gmv" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorGmv)" activeDot={{ r: 6, fill: '#3b82f6', stroke: '#000', strokeWidth: 2 }} />
        <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" activeDot={{ r: 6, fill: '#10b981', stroke: '#000', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
