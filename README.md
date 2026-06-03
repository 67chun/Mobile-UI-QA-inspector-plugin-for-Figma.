# Mobile UI QA Inspector

A Figma plugin for checking mobile UI design quality before handoff.

Mobile UI QA Inspector helps designers quickly review 375px mobile UI frames and detect common specification issues, including typography, spacing, radius, alignment, and layout consistency.

## Features

* Check whether the selected Frame matches the 375px mobile UI baseline
* Scan typography usage, including font size, font family, and font weight
* Detect small text risks and mixed text styles
* Check spacing based on a 2px spacing unit
* Check border radius consistency and nested radius relationships
* Check basic alignment consistency
* Skip internal elements inside component instances to reduce false positives
* Locate related layers directly in Figma
* Ignore intentional issues and restore ignored issues when needed
* Customize basic QA settings inside the plugin
* Dark UI optimized for mobile-style plugin panels

## Use Case

This plugin is designed for mobile UI designers who need a lightweight QA tool before design handoff.

Typical use cases include:

* Reviewing mobile interface details before delivery
* Checking whether typography and spacing are consistent
* Finding possible radius and alignment issues
* Locating problematic layers quickly
* Reducing repetitive manual UI inspection work

## How to Use

1. Open a Figma file.
2. Select a mobile Frame.
3. The recommended baseline is:

   * Width: `375px`
   * Height: `812px` or longer
4. Run `Mobile UI QA Inspector`.
5. Click **Start Check**.
6. Review the issue list.
7. Use **Locate Layer** to jump to the related layer.
8. Use **Ignore** if the issue is intentional.
9. Use **Restore** or **Restore All** to bring ignored issues back.

## Current Check Rules

### Frame

* Standard mobile page: `375 × 812`
* Long mobile page: width `375px`, height greater than `812px`
* Other widths will be treated as non-standard for this plugin

### Typography

* Detects font size, font family, font weight, and mixed text styles
* Small text is treated as a risk prompt, not an absolute error
* Multiple font weights under the same font family may trigger a reminder

### Spacing

* Uses `2px` as the default spacing unit
* Even values such as `10px`, `12px`, `14px`, `16px`, and `18px` are treated as valid
* Odd values such as `11px`, `13px`, `15px`, `17px`, and `19px` may trigger a reminder
* Auto Layout alignment is considered to reduce false positives
* Left-aligned layouts do not check unused right-side space
* Right-aligned layouts do not check unused left-side space
* Centered layouts focus on symmetry

### Radius

* Does not force fixed radius values
* Checks whether similar components use consistent radius logic
* Checks nested radius relationships
* Capsule and icon buttons are treated separately to avoid false positives

### Alignment

* Checks basic alignment consistency within the same visual group
* Separates full-width components and content cards to reduce false positives
* Component instance internals are skipped

## Installation for Development

Clone or download this repository.

Install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

Import the plugin in Figma:

1. Open Figma Desktop.
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `manifest.json`.
4. Run `Mobile UI QA Inspector`.

## Project Structure

```txt
Mobile UI QA Inspector
├─ manifest.json
├─ package.json
├─ tsconfig.json
├─ src
│  ├─ code.ts
│  ├─ ui.html
│  ├─ types.ts
│  └─ rules
│     ├─ typographyRules.ts
│     ├─ spacingRules.ts
│     ├─ radiusRules.ts
│     └─ alignmentRules.ts
├─ dist
│  ├─ code.js
│  └─ ui.html
└─ scripts
```

## Privacy

This plugin runs locally inside Figma.

It does not upload design files, does not use external APIs, and does not require network access.

## Status

Current version: `v0.1`

This is an early functional version focused on mobile UI QA workflows. It is intended as a practical design tool and a design-engineering experiment.

## Author

Created by 67chun.

Feedback: Xiaohongshu ID `1693560303`
