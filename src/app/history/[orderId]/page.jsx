"use client";

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function OrderHistoryDetailHeadless() {
  const router = useRouter();
  const { orderId } = useParams();

  useEffect(() => {
    if (orderId) {
      router.replace(`/tracking/${orderId}`);
    } else {
      router.replace('/history');
    }
  }, [orderId, router]);

  return null;
}
