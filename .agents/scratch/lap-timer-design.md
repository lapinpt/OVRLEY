Four display_types for lap timer:

**Current Lap Time**

Shows the current lap time so far as dynamic live timing. If there is no current lap time yet, it will show --:--.--. It also contains a toggle for delta to best lap time. If the toggle is on, it will show the delta to the best lap time-so-far to the right of the current lap time.

**Best Lap Time**

Shows the best lap time so far as static text. If there is no best lap time yet, it will show dynamic, live timing of the current lap.

**Live delta to So-far-best Lap Time**

Shows the delta to the best lap time so far. If there is no best lap time yet, it should show 0.00 or --? What's more standard. Delta should always show a sign + or -.

**Lapime log**

This is a simple table that shows header with lap number, lap time and delta to the best lap time until (up to that lap; not future best laps). Underneath each lap is listed as one row. Headers use the font color with 70% opacity. The table will only shows current and past laps, not future laps and it will only add/update the table when a lap is completed. We need to be smart about constructing this since Rust rendered does not let us use grid/flexbox - we will need to use set cell/column widths/heights that scale with font size.

The following parameters must be configurable:
-font family
-font size
-font color
-position
-text transparency
-negative/positive delta color
-label switch on/off
-label (default Best Lap, Current Lap, Delta to Best Lap, Laptime log)
-they do not contain any background, only text.
-global defaults (font values type/color) must apply/seed on creation properly
-global borders and shadows must apply to the text properly too - see existing text preview/rendering for reference.
