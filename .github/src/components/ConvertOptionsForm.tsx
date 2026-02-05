/**
 * Schema-driven Options Form
 * 
 * Renders form controls based on OptionSchema definitions.
 * Supports string, number, boolean, select, and range inputs.
 */

import { useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import type {
  OptionSchema,
  StringOptionSchema,
  NumberOptionSchema,
  BooleanOptionSchema,
  SelectOptionSchema,
  RangeOptionSchema,
  ConverterOptions,
} from '../lib/convert/types'

interface ConvertOptionsFormProps {
  /** Array of option schemas to render */
  schema: OptionSchema[]
  /** Current option values */
  values: ConverterOptions
  /** Callback when any option changes */
  onChange: (values: ConverterOptions) => void
  /** Optional: disable all inputs */
  disabled?: boolean
}

/**
 * Get default value for an option schema
 */
function getDefaultValue(option: OptionSchema): string | number | boolean {
  switch (option.type) {
    case 'string':
      return option.default ?? ''
    case 'number':
      return option.default ?? option.min ?? 0
    case 'boolean':
      return option.default ?? false
    case 'select':
      return option.default ?? option.options[0]?.value ?? ''
    case 'range':
      return option.default ?? option.min
  }
}

/**
 * Initialize values from schema defaults
 */
export function getDefaultValues(schema: OptionSchema[]): ConverterOptions {
  const values: ConverterOptions = {}
  for (const option of schema) {
    values[option.id] = getDefaultValue(option)
  }
  return values
}

/**
 * String input renderer
 */
function StringInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: StringOptionSchema
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={option.placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
    />
  )
}

/**
 * Number input renderer
 */
function NumberInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: NumberOptionSchema
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={option.min}
      max={option.max}
      step={option.step}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
    />
  )
}

/**
 * Boolean (checkbox) input renderer
 */
function BooleanInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: BooleanOptionSchema
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 border border-gray-300 rounded text-gray-900 focus:ring-gray-200 disabled:opacity-50"
      />
      <span className="text-sm text-gray-700">
        {value ? 'On' : 'Off'}
      </span>
    </label>
  )
}

/**
 * Select (dropdown) input renderer
 */
function SelectInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: SelectOptionSchema
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
      >
        {option.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  )
}

/**
 * Range (slider) input renderer
 */
function RangeInput({
  option,
  value,
  onChange,
  disabled,
}: {
  option: RangeOptionSchema
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={option.min}
        max={option.max}
        step={option.step ?? 1}
        disabled={disabled}
        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
      />
      <span className="text-sm text-gray-600 min-w-[3rem] text-right">
        {value}{option.unit || ''}
      </span>
    </div>
  )
}

/**
 * Single option field renderer
 */
function OptionField({
  option,
  value,
  onChange,
  disabled,
}: {
  option: OptionSchema
  value: string | number | boolean
  onChange: (value: string | number | boolean) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">
        {option.label}
        {option.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      
      {option.type === 'string' && (
        <StringInput
          option={option}
          value={value as string}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      
      {option.type === 'number' && (
        <NumberInput
          option={option}
          value={value as number}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      
      {option.type === 'boolean' && (
        <BooleanInput
          option={option}
          value={value as boolean}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      
      {option.type === 'select' && (
        <SelectInput
          option={option}
          value={value as string}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      
      {option.type === 'range' && (
        <RangeInput
          option={option}
          value={value as number}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      
      {option.description && (
        <p className="text-xs text-gray-400 mt-1">{option.description}</p>
      )}
    </div>
  )
}

/**
 * Schema-driven options form component
 */
export function ConvertOptionsForm({
  schema,
  values,
  onChange,
  disabled = false,
}: ConvertOptionsFormProps) {
  // Initialize missing values with defaults
  useEffect(() => {
    const hasAllValues = schema.every(opt => opt.id in values)
    if (!hasAllValues) {
      const newValues = { ...values }
      for (const option of schema) {
        if (!(option.id in newValues)) {
          newValues[option.id] = getDefaultValue(option)
        }
      }
      onChange(newValues)
    }
  }, [schema, values, onChange])

  const handleChange = useCallback(
    (id: string, value: string | number | boolean) => {
      onChange({ ...values, [id]: value })
    },
    [values, onChange]
  )

  if (schema.length === 0) {
    return null
  }

  // Determine grid columns based on number of options
  const gridCols = schema.length === 1 
    ? 'grid-cols-1' 
    : schema.length === 2 
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className={`grid ${gridCols} gap-4`}>
      {schema.map((option) => (
        <OptionField
          key={option.id}
          option={option}
          value={values[option.id] ?? getDefaultValue(option)}
          onChange={(value) => handleChange(option.id, value)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
