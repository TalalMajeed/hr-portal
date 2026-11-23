"use client";

/** Ticks or clears every row checkbox with the given name in the same form. */
export function SelectAll({ name = "ids", label = "Select all" }: { name?: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-[18px] cursor-pointer accent-teal"
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach((box) => {
          box.checked = e.currentTarget.checked;
        });
      }}
    />
  );
}
