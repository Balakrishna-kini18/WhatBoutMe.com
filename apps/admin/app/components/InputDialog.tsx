"use client";

import React, { useState, useEffect } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./InputDialog.module.css";

export interface InputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
  title: string;
  subtitle?: string;
  description: React.ReactNode;
  label: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  multiline?: boolean;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "warning" | "info";
  isLoading?: boolean;
  error?: string | null;
}

export function InputDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  subtitle,
  description,
  label,
  placeholder,
  initialValue = "",
  required = true,
  multiline = true,
  confirmText = "Submit",
  cancelText = "Cancel",
  tone = "warning",
  isLoading = false,
  error = null,
}: InputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setValidationError(null);
    }
  }, [isOpen, initialValue]);

  const handleConfirm = async () => {
    if (required && !value.trim()) {
      setValidationError("This field is required.");
      return;
    }
    setValidationError(null);
    await onSubmit(value.trim());
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title={title}
      subtitle={subtitle}
      description={description}
      tone={tone}
      confirmText={confirmText}
      cancelText={cancelText}
      isLoading={isLoading}
      error={error || validationError}
    >
      <div className={styles.formGroup}>
        <label className={styles.label}>
          {label}
          {required && <span style={{ color: "var(--status-error, #b91c1c)", marginLeft: "4px" }}>*</span>}
        </label>
        {multiline ? (
          <textarea
            className={styles.textarea}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder={placeholder}
            rows={3}
            autoFocus
            disabled={isLoading}
          />
        ) : (
          <input
            type="text"
            className={styles.input}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder={placeholder}
            autoFocus
            disabled={isLoading}
          />
        )}
      </div>
    </ConfirmDialog>
  );
}
