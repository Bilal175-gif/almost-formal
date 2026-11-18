"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useStore } from "@/lib/store";
export function Modal({
  open,
  onClose,
  children,
  label,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open) {
      d?.showModal();
      document.body.style.overflow = "hidden";
    } else d?.close();
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`modal paper ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="icon-button modal-close"
        aria-label={`Close ${label}`}
        onClick={onClose}
      >
        <X size={23} />
      </button>
      {open && children}
    </dialog>
  );
}
export function Toast() {
  const toast = useStore((s) => s.toast);
  const notify = useStore((s) => s.notify);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(t);
  }, [toast, notify]);
  return toast ? (
    <div className="toast" role="status">
      {toast}
      <button
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={() => notify("")}
      >
        <X size={17} />
      </button>
    </div>
  ) : null;
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <p>{message}</p>
      {retry && (
        <button className="text-link" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
