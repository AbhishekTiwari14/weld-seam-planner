# Official Armatrix assets

Inspected source: the user-supplied Desktop folder `armatrix assets`, specifically `02 Logo System`, `03 Colours System`, and `04 Fonts System`. The complete asset pack, print artwork, archive files, and inspection previews are not copied into this repository.

## Colour system

These are the printed HEX labels in `03 Colours System/Armatrix_master_file.jpg` (the accompanying PDF has no extractable text). Values are transcribed from the labels, not sampled from colour-managed JPEG pixels. CSS uses these exact values in `src/styles/tokens.css`.

| Family | Base | T1 / S1 | T2 / S2 | T3 / S3 | T4 / S4 |
| --- | --- | --- | --- | --- | --- |
| Dark Forest | `#030500` | `#090D00` | `#0E1600` | `#141E00` | `#192600` |
| Light Sand | `#F6F6EE` | `#DFDFD7` | `#C5C5BD` | `#ABABA5` | `#93938D` |
| Revolution Green | `#2B381F` | `#344425` | `#3D4F2C` | `#455B32` | `#628047` |
| Bright Discovery | `#E97F01` | `#E98917` | `#E9942F` | `#E99E46` | `#E9B475` |

### Asset discrepancy

The horizontal RGB SVG files have explicit fills that differ from the palette sheet:

| Supplied SVG variant | Actual SVG fill |
| --- | --- |
| Full colour | `#627F47` |
| Dark Forest | `#040600` |
| Light Sand | `#F5F5EC` |

The palette sheet is the source for UI tokens. Logo artwork must retain its supplied fills. These differences are documented rather than silently harmonized. No logo recolouring or reconstructed wordmark is included.

## Logo inventory

The pack supplies three systems: `01 Logo` (standalone mark), `02 Vertical Logo`, and `03 Horizontal Logo`. Each includes full-colour, Dark Forest, and Light Sand variants. Web assets include SVG, PNG at 600/1200 px, JPG at 600/1200 px, and AI. Print assets include CMYK PDF, JPG, and AI; the standalone mark also includes EPS.

For the future application header, use the supplied horizontal RGB SVG, with the colour variant chosen for the background. Use the standalone mark only where the complete horizontal lockup cannot fit. These are application choices, not a newly invented brand usage guide. No clear-space or minimum-size specification was found in the inspected files.

No logo license/readme was found in `02 Logo System`. The assignment authorizes using the pack for this submission; that is not a general redistribution license. Milestone 1 does not bundle logos or print artwork. Future asset use must preserve provenance and avoid representing Armatrix artwork as project-owned or freely licensed.

## Font system and choices

| Supplied family | Available files | Milestone 1 decision |
| --- | --- | --- |
| Onest | Variable `wght` TTF and static Thin through Black | Use the unmodified variable TTF for UI text, including headings; weights 100–900 |
| 42dot Sans | Variable TTF and Light, Regular, Medium, Bold, ExtraBold static TTFs | Documented alternative; not bundled or assigned an invented official role |
| Redaction | Regular/Bold/Italic, plus 10/20/35/50/70/100 variants, OTF and WOFF2 inside its archive | Display alternative only; not bundled or used in dense engineering controls |

No document in the inspected font folder mandates a specific hierarchy between these families. Choosing Onest for the workbench is a product decision based on a supplied family. System sans-serif is the fallback. No external font request is made.

### Licenses

- Onest: supplied `OFL.txt`, copyright 2021 The Onest Project Authors, SIL OFL 1.1. The selected unmodified TTF and the complete license are bundled together in `public/fonts/onest/`.
- 42dot Sans: supplied `ofl-4.txt`, copyright 2024 The 42dot Sans Project Authors, SIL OFL 1.1. The accompanying Befonts note says commercial use is allowed; it does not replace the full license.
- Redaction: supplied `redaction/OFL.txt` identifies copyright 2019 MCKL Inc. and dual OFL 1.1 / LGPL 2.1 licensing. It is not distributed by this project.

Font redistribution requires retaining the applicable copyright/license notices. No font is modified or sold separately. The foundation's semantic colour roles are application decisions; contrast and interactive states still need verification when real UI components are introduced.
