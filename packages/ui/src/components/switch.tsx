"use client"

import { useCallback, useRef, type Ref } from "react"

import {
  Switch as AstryxSwitch,
  type SwitchProps,
} from "@astryxdesign/core/Switch"

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    return ref(value)
  } else if (ref) {
    ref.current = value
  }
}

/**
 * Compatibility wrapper for callers that associate an external label with
 * the switch through `id`/`htmlFor`. Astryx puts `id` on its field wrapper
 * and generates a separate ID for the native checkbox.
 */
function Switch({ id, ref, ...props }: SwitchProps) {
  const generatedInputId = useRef<string | undefined>(undefined)
  const inputRef = useCallback(
    (input: HTMLInputElement | null) => {
      if (input) {
        generatedInputId.current ??= input.id
        const nextId = id ?? generatedInputId.current

        if (nextId !== input.id) {
          // Astryx's own label points at the generated ID. Keep that
          // association intact when the compatibility ID replaces it.
          const labels = Array.from(input.labels ?? [])
          input.id = nextId
          for (const label of labels) {
            label.htmlFor = nextId
          }
        }
      }

      return setRef(ref, input)
    },
    [id, ref],
  )

  return <AstryxSwitch {...props} ref={inputRef} />
}

export { Switch }
export type {
  SwitchLabelPosition,
  SwitchLabelSpacing,
  SwitchProps,
} from "@astryxdesign/core/Switch"
