# Button Component

Centralized, reusable Button used across the app. It wraps a native `button` with Tailwind class variants so you don’t need to repeat inline classes.

- Path: `src/components/ui/button.tsx`
- Exports: `Button`, `buttonVariants`

## Variants

- `variant`: `default | destructive | outline | secondary | ghost | link`
- `size`: `default | sm | lg | icon | compact | xs | iconSm | iconXs`
- `shape`: `rounded | square | pill`

Defaults: `variant="default"`, `size="default"`, `shape="rounded"`.

> Note: `shape="square"` now shares the same medium radius as `rounded` so all buttons align on the new `rounded-md` baseline. Use `shape="pill"` for fully rounded buttons.

## Usage

Basic:

```tsx
import { Button } from "@/components/ui/button";

<Button>Click me</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
```

Action wrappers for common patterns:

```tsx
import { PrimaryActionButton, SecondaryIconButton } from "@/components/ui/actionButtons";

// Primary: brand-filled, compact, square
<PrimaryActionButton icon={<Plus className="h-4 w-4" />}>{t("global.create")}</PrimaryActionButton>

// Secondary: outline, compact, square with left icon
<SecondaryIconButton icon={<RotateCcw className="h-4 w-4" />}>{t("global.clear")}</SecondaryIconButton>
```

Compact + square (common app style):

```tsx
<Button size="compact" shape="square">{t("global.save")}</Button>
<Button size="iconSm" shape="square" aria-label={t("global.delete")}>
  <Trash2 className="h-4 w-4" />
  <span className="sr-only">{t("global.delete")}</span>
{/**
 * Note: keep labels localized via `t(...)`. The Button itself is presentational;
 * any text/aria labels come from the caller.
 */}
```

Icon-only sizes:

```tsx
<Button size="icon" shape="square">
  <Plus className="h-4 w-4" />
  <span className="sr-only">{t("global.add")}</span>
}

<Button size="iconXs" shape="square">
  <X className="h-4 w-4" />
  <span className="sr-only">{t("global.close")}</span>
}
```

## Migration away from inline Tailwind

Common inline patterns you can remove:

- `h-8 px-3 text-xs` → `size="compact"` (compact uses text-sm now)
- `h-7 px-2 text-xs` → `size="xs"`
- `h-8 w-8` on icon buttons → `size="iconSm"`
- `h-6 w-6` on icon buttons → `size="iconXs"`

Example migrations:

```tsx
// Before
<Button className="h-8 px-3 text-xs hover:bg-orange-600">Create</Button>

// After (same look; cleaner props)
<Button size="compact" shape="square" className="hover:bg-orange-600">Create</Button>
```

```tsx
// Before
<Button size="icon" className="h-6 w-6 p-1">...</Button>

// After
<Button size="iconXs" shape="square" className="p-1">...</Button>
```

## Notes on hover color

Some places use `hover:bg-orange-600` for a stronger brand hover. Keep applying it via `className` for now:

```tsx
<Button size="compact" className="hover:bg-orange-600">{t("global.search")}</Button>
```

If we standardize the brand hover globally later, we can add a dedicated variant.
