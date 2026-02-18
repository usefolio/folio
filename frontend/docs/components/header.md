# Header View Switcher

Path: `src/components/Header.tsx`

- The center view selector now uses `Tabs` (`@/components/ui/tabs`) so Workflow and Grid render as a pill-style toggle. The active tab mirrors the current route (`/workflow` or `/`) and updates react-router via `onValueChange`.
- The workflow option shows the `GitBranch` icon and the grid option uses `Table2`; both compress into a 6px-tall trigger within an 8px container so the control sits tighter in the header.
- Active tabs tint their icon `text-orange-500` (see `group-data-[state=active]` classes) while the label returns to the default foreground color; inactive icons stay muted.
- Each trigger handles its own active background (`data-[state=active]:bg-background`), so there is no separate sliding pill to bleed outside the container while still giving the selected view a solid fill.
- The TabsList and triggers use `rounded-md` so the selector keeps a soft pill shape while the inline active styling stays inside each option.
- The header's actions dropdown and the jobs/chat/settings icon buttons now share the same `rounded-md` radius to match the selector.
- A disabled `Notepad` tab (using the `Notebook` icon) is rendered to reserve space for the upcoming view. Enable it by wiring the `notepad` value in `handleViewChange` once the route exists.
- Strings are localized under `header.workflow`, `header.grid_view`, and `header.notepad` in `src/locales/en.json`.
- Styling tweaks come from Tailwind utility classes directly on the triggers; adjust the palette by editing the classes on `TabsList` or each `TabsTrigger`.
- Active triggers add `data-[state=active]:shadow-none` so the default drop shadow from `TabsTrigger` doesn't create a second glow below the component.
