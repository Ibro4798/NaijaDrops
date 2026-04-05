const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://rhmojvcthzxuanijcjtu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobW9qdmN0aHp4dWFuaWpjanR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjQ1OTksImV4cCI6MjA4ODgwMDU5OX0.n1D53zIFM7HeaDIHFB3o-26qzUPFH0ToAfO0xoyY-PY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const orderInsert = {
    user_id: '1504cf01-2092-4ebd-a316-015baab2f534', // valid uuid string format
    pickup_name: 'Test Pickup',
    pickup_lat: 12.0,
    pickup_lng: 8.5,
    dropoff_name: 'Test Dropoff',
    dropoff_lat: 12.1,
    dropoff_lng: 8.6,
    item_category: 'Other',
    item_size: 'Small',
    receiver_name: 'John Doe',
    receiver_phone: '08012345678',
    fare_type: 'standard',
    agreed_price: 1500,
    status: 'looking_for_driver',
    delivery_pin: '1234',
    pickup_details: null,
    dropoff_details: null,
    scheduled_at: null
  };

  const { data, error } = await supabase.from('orders').insert(orderInsert).select().single();
  console.log("Error:", error?.message || error);
  console.log("Data:", data);
}
test();
