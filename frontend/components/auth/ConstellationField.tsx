"use client"

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { motion } from "framer-motion"
import { useReducedMotion } from "framer-motion"

export type ConstellationNodeState = "inactive" | "active" | "focused" | "filled" | "error" | "pulse"

interface ConstellationFieldProps {
  id: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  onKeyUp?: (event: KeyboardEvent<HTMLInputElement>) => void
  error?: string
  autoComplete?: string
  placeholder?: string
  inputMode?: "email" | "text" | "tel" | "numeric"
  name?: string
  leftIcon?: ReactNode
  rightSlot?: ReactNode
  nodeState?: ConstellationNodeState
  showPulse?: boolean
  index?: number
}

export function ConstellationField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  error,
  autoComplete,
  placeholder,
  inputMode,
  name,
  leftIcon,
  rightSlot,
  nodeState = "inactive",
  showPulse = false,
  index = 0,
}: ConstellationFieldProps) {
  const [focused, setFocused] = useState(false)
  const reduced = useReducedMotion() ?? false
  const describedBy = error ? `${id}-error` : undefined
  const floated = focused || value !== ""
  const inputRef = useRef<HTMLInputElement>(null)

  const effectiveState: ConstellationNodeState = error
    ? "error"
    : focused
    ? "focused"
    : value
    ? "filled"
    : nodeState

  const nodeColors = {
    inactive: {
      glow: "rgba(45, 212, 191, 0)",
      border: "var(--border-muted)",
      text: "var(--text-muted)",
    },
    active: {
      glow: "rgba(45, 212, 191, 0.08)",
      border: "rgba(45, 212, 191, 0.3)",
      text: "var(--text-muted)",
    },
    focused: {
      glow: "rgba(45, 212, 191, 0.15)",
      border: "rgba(45, 212, 191, 0.6)",
      text: "#2dd4bf",
    },
    filled: {
      glow: "rgba(45, 212, 191, 0.1)",
      border: "rgba(45, 212, 191, 0.4)",
      text: "var(--foreground)",
    },
    error: {
      glow: "rgba(248, 113, 113, 0.12)",
      border: "rgba(248, 113, 113, 0.6)",
      text: "#f87171",
    },
    pulse: {
      glow: "rgba(45, 212, 191, 0.2)",
      border: "rgba(45, 212, 191, 0.8)",
      text: "#2dd4bf",
    },
  }

  const colors = nodeColors[effectiveState]

  useEffect(() => {
    if (showPulse && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showPulse])

  return (
    <motion.div
      className="constellation-node group relative"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Connection line to next node */}
      {!error && (
        <div className="constellation-connector" aria-hidden="true">
          <div className="constellation-line" />
          <div className="constellation-line-glow" />
        </div>
      )}

      {/* Node glow backdrop */}
      <motion.div
        className="constellation-node-glow pointer-events-none absolute inset-0 rounded-2xl"
        animate={
          reduced
            ? undefined
            : {
                opacity: effectiveState === "focused" ? 1 : effectiveState === "filled" ? 0.6 : effectiveState === "pulse" ? 1 : 0.4,
                scale: effectiveState === "focused" ? 1.02 : 1,
              }
        }
        transition={{ duration: 0.3 }}
        style={{
          background: `radial-gradient(ellipse at center, ${colors.glow}, transparent 70%)`,
        }}
      />

      {/* Node border glow */}
      <motion.div
        className="constellation-node-border pointer-events-none absolute inset-0 rounded-2xl"
        animate={reduced ? undefined : { opacity: effectiveState === "focused" ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        style={{
          boxShadow: `0 0 20px ${colors.border}, inset 0 0 20px ${colors.glow}`,
          border: `1px solid ${colors.border}`,
        }}
      />

      {/* Pulse ring for energy flow effect */}
      {!reduced && showPulse && (
        <motion.div
          className="constellation-pulse-ring pointer-events-none absolute inset-0 rounded-2xl"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.1, 1.2] }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            border: `2px solid ${colors.border}`,
          }}
        />
      )}

      <div className="group/field relative">
        {leftIcon && (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-[var(--text-muted)] transition-colors duration-200 ${
              focused ? "text-emerald-400" : ""
            }`}
          >
            {leftIcon}
          </span>
        )}

        {/* Mono label above field */}
        <div className="mb-1.5 flex items-center gap-2">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.22em]"
            style={{ color: colors.text }}
          >
            {label}
          </span>
          {/* Node indicator dot */}
          <span
            className="constellation-dot h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: colors.border,
              boxShadow: `0 0 6px ${colors.border}`,
            }}
          />
        </div>

        <input
          ref={inputRef}
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            setFocused(true)
            onFocus?.()
          }}
          onBlur={() => {
            setFocused(false)
            onBlur?.()
          }}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          autoComplete={autoComplete}
          placeholder={focused && !value && placeholder ? placeholder : " "}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-[var(--surface-raised)] py-3 text-base text-[var(--foreground)] outline-none backdrop-blur-sm transition-all duration-200 placeholder:text-[var(--text-muted)] sm:py-3.5 ${
            leftIcon ? "pl-11" : "pl-4"
          } ${rightSlot ? "pr-12" : "pr-4"} ${
            error ? "border-red-500/70" : ""
          }`}
          style={{
            borderColor: error ? undefined : focused ? "rgba(45, 212, 191, 0.6)" : value ? "rgba(45, 212, 191, 0.35)" : "var(--border-muted)",
            boxShadow: focused ? "0 0 0 4px rgba(16, 185, 129, 0.08), 0 0 24px rgba(16, 185, 129, 0.12)" : "none",
          }}
        />

        {rightSlot && (
          <div className="absolute inset-y-0 right-2 flex items-center">{rightSlot}</div>
        )}
      </div>

      {error && (
        <p id={describedBy} role="alert" className="mt-1.5 text-sm text-red-500">
          {error}
        </p>
      )}
    </motion.div>
  )
}
