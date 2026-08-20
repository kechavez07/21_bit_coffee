import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  CATEGORY_LABELS,
  groupCatalogByCategory,
  normalizeForSearch,
} from '../utils/catalog'
import type { Product, ProductCategory, Variant } from '../services/firebase/catalog'
import './VariantCombobox.css'

export interface VariantComboboxOption {
  variantId: string
  category: ProductCategory
  label: string
}

interface VariantComboboxProps {
  id: string
  products: Product[]
  variants: Variant[]
  value: string
  onChange: (variantId: string) => void
  /** Variants to leave out of the list entirely — e.g. ones already added to a working draft (RequestItemsForm). */
  excludeVariantIds?: string[]
  placeholder?: string
  required?: boolean
}

function variantLabel(productName: string, flavor: string | null): string {
  return flavor ? `${productName} — ${flavor}` : productName
}

/**
 * Autocomplete replacement for a plain `<select>` over every active
 * variant, grouped by category — the same data `CatalogPage`/`MovementsPage`
 * already compute via `groupCatalogByCategory`, just rendered as a
 * type-to-filter list instead of a native dropdown you have to scroll
 * through by hand (the catalog has 50+ variants once seeded for real).
 *
 * Implements the ARIA combobox pattern by hand (no dependency): the input
 * is `role="combobox"`, the results are a `role="listbox"` positioned
 * below it, and the currently-highlighted option is tracked via
 * `aria-activedescendant` rather than moving DOM focus off the input.
 * Options use `onMouseDown` + `preventDefault()` (not `onClick`) so a
 * pointer selection registers before the input's `onBlur` would otherwise
 * close the list first.
 */
export function VariantCombobox({
  id,
  products,
  variants,
  value,
  onChange,
  excludeVariantIds,
  placeholder = 'Buscar producto o sabor…',
  required,
}: VariantComboboxProps) {
  const excluded = useMemo(() => new Set(excludeVariantIds ?? []), [excludeVariantIds])

  const groupedOptions = useMemo(() => {
    const groups = groupCatalogByCategory(products, variants)
    return groups
      .map((group) => ({
        category: group.category,
        options: group.products.flatMap(({ product, variants: productVariants }) =>
          productVariants
            .filter((variant) => variant.active && !excluded.has(variant.id))
            .map(
              (variant): VariantComboboxOption => ({
                variantId: variant.id,
                category: group.category,
                label: variantLabel(product.name, variant.flavor),
              }),
            ),
        ),
      }))
      .filter((group) => group.options.length > 0)
  }, [products, variants, excluded])

  const allOptions = useMemo(() => groupedOptions.flatMap((g) => g.options), [groupedOptions])
  const selectedOption = allOptions.find((opt) => opt.variantId === value) ?? null

  const [query, setQuery] = useState(selectedOption?.label ?? '')
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the displayed text in sync when the selection changes from
  // outside (e.g. the form resets after a successful submit).
  useEffect(() => {
    setQuery(selectedOption?.label ?? '')
  }, [selectedOption?.label])

  const normalizedQuery = normalizeForSearch(query)
  const isFilterActive = open && normalizedQuery.length > 0 && normalizedQuery !== normalizeForSearch(selectedOption?.label ?? '')

  const filteredGroups = useMemo(() => {
    if (!isFilterActive) return groupedOptions
    return groupedOptions
      .map((group) => ({
        ...group,
        options: group.options.filter((opt) => normalizeForSearch(opt.label).includes(normalizedQuery)),
      }))
      .filter((group) => group.options.length > 0)
  }, [groupedOptions, isFilterActive, normalizedQuery])

  const flatFiltered = useMemo(() => filteredGroups.flatMap((g) => g.options), [filteredGroups])

  useEffect(() => {
    if (highlightedIndex >= flatFiltered.length) {
      setHighlightedIndex(0)
    }
  }, [flatFiltered.length, highlightedIndex])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setQuery(selectedOption?.label ?? '')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedOption?.label])

  function selectOption(option: VariantComboboxOption) {
    onChange(option.variantId)
    setQuery(option.label)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((i) => Math.min(i + 1, flatFiltered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      if (open && flatFiltered[highlightedIndex]) {
        event.preventDefault()
        selectOption(flatFiltered[highlightedIndex])
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery(selectedOption?.label ?? '')
    }
  }

  const listboxId = `${id}-listbox`
  const activeOption = flatFiltered[highlightedIndex]
  const activeOptionId = activeOption ? `${id}-option-${activeOption.variantId}` : undefined

  return (
    <div className="combobox" ref={containerRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open ? activeOptionId : undefined}
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlightedIndex(0)
          if (value) onChange('') // typing invalidates the previous selection until a new option is picked
        }}
        onKeyDown={handleKeyDown}
      />

      {open && (
        <ul id={listboxId} role="listbox" className="combobox-listbox">
          {flatFiltered.length === 0 ? (
            <li className="combobox-empty" role="presentation">
              Sin resultados
            </li>
          ) : (
            filteredGroups.map((group) => (
              <li key={group.category} role="presentation" className="combobox-group">
                <span className="combobox-group-label">{CATEGORY_LABELS[group.category]}</span>
                <ul role="presentation">
                  {group.options.map((option) => {
                    const flatIndex = flatFiltered.indexOf(option)
                    return (
                      <li
                        key={option.variantId}
                        id={`${id}-option-${option.variantId}`}
                        role="option"
                        aria-selected={option.variantId === value}
                        className={`combobox-option${flatIndex === highlightedIndex ? ' combobox-option-active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          selectOption(option)
                        }}
                        onMouseEnter={() => setHighlightedIndex(flatIndex)}
                      >
                        {option.label}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
