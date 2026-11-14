# Optimisation of Suspension and Brakes System for FSAE

CDE4301 report by Anson Chua, Mechanical Engineering, NUS Formula SAE.

## Editing the report

- `index.html` contains the title, author information and all five chapters. Search for `data-chapter="section-1.html"` through `section-5.html` to find each chapter.
- `assets/` contains the figures. Keep image filenames in `index.html` consistent with this folder.
- `index.css` controls the report's appearance and printing.
- `report.js` provides chapter navigation, collapsible contents, image enlargement and printing.

The contents sidebar stays visible while the selected chapter changes. A link such as `index.html?page=section-3.html` opens the calculations chapter. Add `&anchor=sub-section-sizing` to link to a subsection. Existing section links using `#section-calculations` also work.

Use **Read full report** to see all chapters. **Print / Save PDF** prints the entire report, including chapters that are hidden in the normal chapter view. Select Save as PDF in the browser's print dialog. Check the preview before submission, since page breaks can vary between browsers.

## Interactive suspension model

Section 1.1 shows an interactive 3D model of the R27e suspension (`assets/models/r27e-suspension.glb`, exported from the SolidWorks assembly). The viewer is `components/suspension/viewer.js` and `viewer.css`; Three.js and its Draco decoder are served from `components/suspension/vendor/`, so no build step is needed.

Callout labels name the key parts and are coloured by subsystem. To add, rename or move a label, edit the `LABELS` list at the top of `viewer.js`: `match` selects the CAD parts by name, and `at` sets which corner of the car carries the callout in each view. Subsystem names and colours are in `SUBSYSTEMS`. The subsystem cards below the model highlight their parts when hovered or tapped. Printing uses the static image instead of the 3D view.

To replace the model, export the assembly from SolidWorks as glTF/GLB (for example with a glTF exporter add-in, or via STEP into Blender), keep the part names, and save it over `assets/models/r27e-suspension.glb`.

## Password protection

**Password protection requires setup. The presence of a workflow file does not mean the current website is protected.** Follow [PASSWORD_SETUP.md](PASSWORD_SETUP.md).

The protected build embeds every referenced report image, stylesheet and script into one HTML document, then encrypts it using StatiCrypt. Only that encrypted document is published. Readers enter the shared report password once, then can navigate every chapter. The password is not remembered between reloads.

Source files must be in a **private repository**. GitHub Pages publishing from a private personal repository requires a supporting plan such as GitHub Pro. Keep the report password in the GitHub Actions repository secret `REPORT_PASSWORD`, never in a committed file.

Once configured, saving changes to `main` runs **Publish password-protected report** automatically. A failed build keeps the previous deployment; always check the Actions result when changing the password.

## Local development

Run `python3 -m http.server 8000` from the repository and open `http://localhost:8000` for an unencrypted local preview.

For an encrypted build, install dependencies with `npm ci --ignore-scripts`, provide the `STATICRYPT_PASSWORD` environment variable securely, then run `npm run build:protected`. The output is `dist/index.html`. The build refuses missing or fewer-than-16-character passwords and never falls back to unencrypted output. Do not publish the repository root when enabling password protection.

The layout follows the fixed sidebar and chapter navigation approach in the [reference CDE4301 report](https://iattorney.github.io/CDE4301-FTS-438/index.html?page=section-1.html). Report text and figures belong to this project.
