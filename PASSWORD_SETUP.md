# Enable the report password

The redesigned report and encryption workflow are prepared. Password protection is **not active** until the following configuration is complete and the protected deployment succeeds.

## 1. Check your GitHub plan

Publishing GitHub Pages from a private personal repository requires GitHub Pro or another supporting plan. A private source repository alone does not make the published website private; encryption protects the published report.

If your account is on GitHub Free, stop here and arrange a suitable plan or a different protected hosting service before changing visibility. Do not make a purchase without reviewing the cost. The GitHub connection used to edit report files cannot change your plan, repository visibility, Pages source, or repository secrets.

## 2. Remove public access to the source

1. Open this repository's **Settings → Pages**. Temporarily **Unpublish site** so the old unencrypted deployment is not left accessible during setup.
2. Open **Settings → General**, scroll to **Danger Zone**, choose **Change repository visibility**, and make the repository **Private**.

The private repository hides its current source and commit history from the public. Previously downloaded copies and public forks cannot be recalled by this change. Add your supervisor as a collaborator if they need access to the source files themselves.

## 3. Set your report password

1. In repository **Settings**, select **Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Set the name to `REPORT_PASSWORD`.
4. Enter a unique, randomly generated password of at least 16 characters (24 or more is preferable) in the secret field and save it. Use a password manager to generate and keep it.

This is a separate password for reading the report. Do not use your GitHub, university or email account password. Do not put it in a report file, commit message, issue, URL or chat. Give the report password only to intended readers through your usual private channel.

## 4. Publish the encrypted version

1. In **Settings → Pages → Build and deployment**, change **Source** to **GitHub Actions**. Do not select **Deploy from a branch** for the protected site.
2. Open the repository's **Actions** tab.
3. Select **Publish password-protected report**, then **Run workflow** on `main`.
4. Wait for both **build** and **deploy** to succeed. If GitHub asks for approval to deploy to the `github-pages` environment, review and approve it.

The workflow refuses to publish from a public repository. It also refuses a missing or short password. It uploads only `dist/index.html`, containing the encrypted report, and never uploads plaintext chapter files or raw images.

## 5. Check access before sharing

Open the deployed website in a new private/incognito window. It should show **Report access** with a password field. An incorrect password must fail. Your correct password should reveal the report, chapter links and figures. Opening an old raw image URL such as `assets/braking_forces_graph.png` should return 404 after the protected deployment replaces the old site.

Also confirm that a signed-out visitor cannot open the GitHub repository or its old commits. Do not treat the site as protected until all these checks pass.

## Later edits and password changes

Edit `index.html`, `index.css`, `report.js`, or the images normally. Pushes to `main` rebuild the encrypted site once setup is complete. For a new report password, update `REPORT_PASSWORD` and manually run the workflow again. Check deployment success before telling readers the password has changed.

The encrypted file can be downloaded and attacked offline, so password length matters. Changing the password protects the newly published copy; it cannot revoke copies that readers have already saved or decrypted. Use authenticated server hosting instead if you later need individual accounts or access revocation.

## Official references

- [GitHub Pages availability and publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Repository visibility](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [StatiCrypt usage and security model](https://github.com/robinmoisson/staticrypt)
