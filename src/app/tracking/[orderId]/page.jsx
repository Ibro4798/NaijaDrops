"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function OldTrackingRedirect() {
  const { orderId } = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/track/${orderId}`);
  }, [orderId]);
  return null;
}
