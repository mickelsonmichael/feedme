# Contributing to feedme

This guide walks you through setting up a full local development environment from scratch — including Java, the Android SDK, an emulator, and the app itself.

## Table of Contents

- [Prerequisites overview](#prerequisites-overview)
- [1. Install Node.js](#1-install-nodejs)
- [2. Install Java (OpenJDK)](#2-install-java-openjdk)
- [3. Install Android SDK](#3-install-android-sdk)
- [4. Configure environment variables](#4-configure-environment-variables)
- [5. Install Android SDK packages](#5-install-android-sdk-packages)
- [6. Create an Android Virtual Device](#6-create-an-android-virtual-device)
- [7. Clone the repository](#7-clone-the-repository)
- [8. Start the emulator](#8-start-the-emulator)
- [9. Launch the app](#9-launch-the-app)
- [10. Run the worker (backend)](#10-run-the-worker-backend)
- [11. Run everything together](#11-run-everything-together)
- [Development workflow](#development-workflow)

---

## Prerequisites overview

| Tool | Minimum version | Required for |
|------|----------------|--------------|
| Node.js | 22 | Both projects |
| npm | 10 | Both projects |
| Git | any | Both projects |
| OpenJDK | 17 (exactly; see note) | Android build |
| Android SDK | API 34 | Android emulator |

---

## 1. Install Node.js

### macOS / Linux (Homebrew)

```bash
brew install node
```

### Windows

Download and run the installer from [nodejs.org](https://nodejs.org), or use winget:

```powershell
winget install OpenJS.NodeJS.LTS
```

Verify the installation:

```bash
node --version   # should print v22.x or higher
npm --version
```

---

## 2. Install Java (OpenJDK)

Android build tools require **Java 17**. Use the versioned `openjdk@17` formula — do **not** use the unversioned `openjdk` formula, which installs the latest Java release and is incompatible with the Gradle version used by this project.

> **Common mistake:** Installing `brew install openjdk` (without `@17`) gives you the latest Java (currently Java 26+). Gradle will fail with `Unsupported class file major version 70`. Always install `openjdk@17` explicitly.

### macOS (Homebrew)

```bash
brew install openjdk@17
```

Add it to your shell profile (`~/.zshrc`, `~/.bash_profile`, etc.):

```bash
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec"
export PATH="$JAVA_HOME/bin:$PATH"
```

Reload your shell, then optionally create the system-wide Java symlink so macOS tools can also find it:

```bash
sudo ln -sfn "$(brew --prefix openjdk@17)/libexec/openjdk.jdk" \
  /Library/Java/JavaVirtualMachines/openjdk-17.jdk
```

### Linux (Homebrew)

```bash
brew install openjdk@17
```

Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec"
export PATH="$JAVA_HOME/bin:$PATH"
```

> **Note:** If you prefer your system package manager, install `openjdk-17-jdk` (Debian/Ubuntu) or `java-17-openjdk-devel` (Fedora/RHEL) and set `JAVA_HOME` to the installation path reported by `java -XshowSettings:all -version 2>&1 | grep java.home`.

### Windows

Download the OpenJDK 17 installer from [Adoptium](https://adoptium.net) (Eclipse Temurin), or use winget:

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
```

The installer sets `JAVA_HOME` and updates `Path` automatically. If it does not, set them manually in **System Properties → Environment Variables**:

- `JAVA_HOME` → `C:\Program Files\Eclipse Adoptium\jdk-17.x.x.x-hotspot`
- Append `%JAVA_HOME%\bin` to `Path`

Verify:

```bash
java -version   # should print openjdk version "17.x.x"
```

---

## 3. Install Android SDK

Install only the command-line tools — Android Studio is not required.

### macOS (Homebrew)

```bash
brew install --cask android-commandlinetools
```

The cask places the tools under `$(brew --prefix)/share/android-commandlinetools`. You still need to set `ANDROID_HOME` (see [step 4](#4-configure-environment-variables)) and use `sdkmanager` to install SDK packages.

### Linux (Homebrew)

```bash
brew install android-commandlinetools
```

> **Note:** On Linux, Homebrew installs `android-commandlinetools` as a formula (not a cask). The tools and all subsequently installed SDK packages land in `$(brew --prefix)/share/android-commandlinetools`. You still need to set `ANDROID_HOME` (see [step 4](#4-configure-environment-variables)) and use `sdkmanager` to install SDK packages.

### Windows

1. Visit [developer.android.com/studio#command-tools](https://developer.android.com/studio#command-tools) and download the Windows zip.

2. Create the SDK directory and extract:

   ```powershell
   New-Item -ItemType Directory -Path "$env:LOCALAPPDATA\Android\sdk\cmdline-tools" -Force
   Expand-Archive commandlinetools-win-<VERSION>_latest.zip `
     -DestinationPath "$env:LOCALAPPDATA\Android\sdk\cmdline-tools"
   Rename-Item "$env:LOCALAPPDATA\Android\sdk\cmdline-tools\cmdline-tools" `
               "$env:LOCALAPPDATA\Android\sdk\cmdline-tools\latest"
   ```

---

## 4. Configure environment variables

`ANDROID_HOME` tells build tools and the Expo CLI where the SDK lives. Add the following to your shell profile and reload it.

### macOS (Homebrew install)

```bash
# ~/.zshrc or ~/.bash_profile
export ANDROID_HOME="$HOME/Library/Android/sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools/latest"

# Link the Homebrew-installed tools into the expected location
ln -sfn "$(brew --prefix)/share/android-commandlinetools/." \
  "$ANDROID_HOME/cmdline-tools/latest"

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

### Linux (Homebrew install)

```bash
# ~/.bashrc or ~/.zshrc
export JAVA_HOME="$(brew --prefix openjdk@17)/libexec"
export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

### Windows (PowerShell profile / System Properties)

In **System Properties → Environment Variables**, create or edit:

| Variable | Value |
|----------|-------|
| `ANDROID_HOME` | `%LOCALAPPDATA%\Android\sdk` |
| `Path` (append) | `%ANDROID_HOME%\cmdline-tools\latest\bin` |
| `Path` (append) | `%ANDROID_HOME%\platform-tools` |
| `Path` (append) | `%ANDROID_HOME%\emulator` |

Restart any open terminals after applying changes.

Verify `sdkmanager` is reachable:

```bash
sdkmanager --version
```

---

## 5. Install Android SDK packages

Accept all licences first, then install the required packages:

```bash
yes | sdkmanager --licenses
sdkmanager \
  "platform-tools" \
  "build-tools;34.0.0" \
  "platforms;android-34" \
  "emulator" \
  "system-images;android-34;google_apis;x86_64"
```

> **Apple Silicon (arm64) Macs:** replace `x86_64` with `arm64-v8a` throughout this guide. The arm64 image runs natively and is significantly faster than the x86_64 image under Rosetta.
>
> ```bash
> sdkmanager "system-images;android-34;google_apis;arm64-v8a"
> ```

---

## 6. Create an Android Virtual Device

Create an AVD using the system image installed above:

```bash
avdmanager create avd \
  --name feedme_avd \
  --package "system-images;android-34;google_apis;x86_64" \
  --device "pixel_6"
```

Apple Silicon:

```bash
avdmanager create avd \
  --name feedme_avd \
  --package "system-images;android-34;google_apis;arm64-v8a" \
  --device "pixel_6"
```

Confirm the AVD was created:

```bash
avdmanager list avd
```

---

## 7. Clone the repository

```bash
git clone https://github.com/mickelsonmichael/feedme.git
cd feedme
```

Install root-level dev dependencies (used by the `npm run start` convenience script):

```bash
npm install
```

Install dependencies for each project:

```bash
cd app && npm install && cd ..
cd worker && npm install && cd ..
```

---

## 8. Start the emulator

Start the emulator in the background. The `-no-audio` flag prevents audio device errors in headless or server environments.

### macOS / Linux

```bash
$ANDROID_HOME/emulator/emulator -avd feedme_avd -no-audio &
```

Wait for the device to finish booting:

```bash
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do
  sleep 2
done
echo "Emulator ready"
```

### Windows (PowerShell)

```powershell
Start-Process "$env:ANDROID_HOME\emulator\emulator.exe" `
  -ArgumentList "-avd feedme_avd -no-audio" -WindowStyle Hidden
```

Then wait for boot:

```powershell
adb wait-for-device
while ((adb shell getprop sys.boot_completed).Trim() -ne "1") { Start-Sleep 2 }
Write-Host "Emulator ready"
```

Confirm the device is online on all platforms:

```bash
adb devices   # expect:  emulator-5554   device
```

---

## 9. Launch the app

### Android (emulator)

Build and install the APK, then start the Metro bundler. This only needs to be done once (or after native dependency changes):

```bash
cd app
npx expo run:android
```

> **Subsequent runs:** once the APK is installed you only need the Metro bundler — no full rebuild required. Start it with `npm run start` from the `app/` directory and the app will connect automatically and hot-reload JS changes.

Launch the installed app manually at any time:

```bash
adb shell am start -n com.feedme.app/.MainActivity
```

### Web (deprecated)

The web build is **deprecated**. It still runs, but it is not maintained or verified, and changes are not expected to work there.

```bash
cd app
npm run web
```

Open [http://localhost:8081](http://localhost:8081) in your browser.

---

## 10. Run the worker (backend)

The app fetches RSS feeds through the Cloudflare Worker. Start the local worker dev server in a separate terminal:

```bash
cd worker
npx wrangler dev
```

The worker runs at `http://localhost:8787`. Verify it is up:

```bash
curl -v http://localhost:8787
# Expect: 400 "Missing url parameter" — this is normal and means the worker is running.
```

---

## 11. Run everything together

From the **repository root**, start both the Expo dev server and the worker in a single command:

```bash
npm run start
```

---

## Development workflow

### Quality checks

Run both checks from the `app/` directory before opening a pull request:

```bash
cd app
npm run format:check   # check formatting (Prettier)
npm run typecheck      # TypeScript type check
```

Fix formatting automatically:

```bash
cd app
npm run format
```

Worker type check:

```bash
cd worker
npx tsc --noEmit
```

### Tests

```bash
# App tests
cd app && npm test

# Worker tests
cd worker && npm run test -- --run

# Both from root
npm test
```

### Hot reload

The Expo Metro bundler supports **Fast Refresh** — TypeScript and JavaScript changes are pushed to the device instantly without rebuilding the APK. A full rebuild (`npx expo run:android`) is only needed when:

- Native dependencies are added or updated
- `app.json` is modified
- This is the first install on a fresh emulator

### Package name

The Android app package name is `com.feedme.app`.
