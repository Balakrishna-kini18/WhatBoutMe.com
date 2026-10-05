"use client";

import { useEffect, useRef, useState, useId } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

export interface SelectOption {
  value: string;
  label: string;
  searchKey?: string;
}

interface SearchableSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export default function SearchableSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  disabled = false,
  required = false,
  className = "",
}: SearchableSelectProps) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Normalize options to SelectOption[]
  const normalizedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === "string"
      ? { value: opt, label: opt, searchKey: opt.toLowerCase() }
      : { ...opt, searchKey: (opt.searchKey || opt.label || opt.value).toLowerCase() }
  );

  // Filter options based on search query
  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase().trim();
    return opt.searchKey?.includes(query) || opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query);
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  useEffect(() => {
    if (open) {
      setSearch("");
      const currentIndex = filteredOptions.findIndex((opt) => opt.value === value);
      setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  // Scroll active item into view
  useEffect(() => {
    if (open && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions[activeIndex]) {
        onChange(filteredOptions[activeIndex].value);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild disabled={disabled}>
          <button
            id={selectId}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-required={required}
            className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-transparent bg-sand px-3.5 py-2.5 text-left text-sm text-ink outline-none transition-colors hover:bg-sand/80 focus:border-gold-deep focus:bg-white disabled:opacity-50"
          >
            <span className={`block truncate ${!selectedOption ? "text-ink-soft/60" : "font-normal text-ink"}`}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200" />
          </button>
        </PopoverPrimitive.Trigger>

        {/* Hidden select input to preserve native form required validation */}
        <input
          tabIndex={-1}
          required={required}
          value={value}
          onChange={() => {}}
          className="pointer-events-none absolute bottom-0 left-0 h-0 w-0 opacity-0"
        />

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[240px] max-w-[360px] overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-xl animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
            onKeyDown={handleKeyDown}
          >
            <div className="relative mb-1.5 flex items-center border-b border-line/60 px-2 pb-1.5 pt-0.5">
              <Search className="mr-2 h-4 w-4 shrink-0 text-ink-soft" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-soft/60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="rounded p-0.5 text-ink-soft hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div
              ref={listRef}
              role="listbox"
              className="max-h-56 overflow-y-auto overflow-x-hidden py-0.5"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs text-ink-soft">
                  No options found
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isActive = idx === activeIndex;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        isSelected
                          ? "bg-gold/15 font-semibold text-gold-deep"
                          : isActive
                          ? "bg-sand text-ink"
                          : "text-ink hover:bg-sand/60"
                      }`}
                    >
                      <span className="truncate pr-2">{opt.label}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-gold-deep" />}
                    </div>
                  );
                })
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
