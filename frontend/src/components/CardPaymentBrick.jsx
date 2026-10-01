import React, { useEffect, useId, useRef } from "react";
import { mountMercadoPagoCard } from "../lib/mercadoPagoCard";

export default function CardPaymentBrick({ publicKey, amount, payerEmail, onReady, onError, onSubmit }) {
  const id = `card-brick-${useId().replace(/[^a-z0-9-]/gi, "")}`;
  const containerRef = useRef(null);
  const callbacksRef = useRef({ onReady, onError, onSubmit });
  callbacksRef.current = { onReady, onError, onSubmit };
  useEffect(() => mountMercadoPagoCard({
    container: containerRef.current,
    publicKey,
    amount,
    payerEmail,
    callbacks: {
      onReady: () => callbacksRef.current.onReady?.(),
      onError: (error) => callbacksRef.current.onError?.(error),
      onSubmit: (data) => callbacksRef.current.onSubmit?.(data),
    },
  }), [id, publicKey, amount, payerEmail]);
  return <div id={id} ref={containerRef} />;
}
