# building the Mobile App (APK)

This project uses **Capacitor** to wrap the HTML/JS web application into a native mobile app. This is the industry-standard "Hybrid" approach (similar to Instagram or Uber, which heavily use webviews).

## 1. Prerequisites
To build the actual `.apk` file, you need:
*   **Android Studio** installed on your machine.
*   **Java (JDK)** installed.

## 2. How to Open in Android Studio
The native Android project is located in the `/android` folder.

1.  Open **Android Studio**.
2.  Select **"Open an existing project"**.
3.  Navigate to inside this project folder and select the `android` directory.
4.  Android Studio will sync the project.

## 3. How to Run on a Real Device
1.  Connect your Android phone via USB.
2.  Enable **Developer Mode** & **USB Debugging** on your phone.
3.  In Android Studio, click the green **Play** button (Run).
4.  The app will be installed and launched on your phone as "ARTELCO".

## 4. How to Update the App
If you make changes to the HTML/CSS/JS codes:

1.  Rebuild the web assets:
    ```bash
    npm run build
    ```
2.  Sync the changes to the native android project:
    ```bash
    npx cap sync
    ```
3.  Run again in Android Studio.

## 5. Alternative: "Add to Home Screen" (PWA)
This app is also a **Progressive Web App (PWA)**.
1.  Host the app on a server (or run `npm run dev -- --host`).
2.  Open the URL on your mobile phone chrome browser.
3.  Tap the menu (3 dots) -> "Add to Home Screen".
4.  It will appear as a standalone app icon on your launcher.

## 6. iOS Local Build
The project is configured for iOS using Capacitor. To build locally, you need a **Mac** with **Xcode** installed.

1.  Rebuild and sync:
    ```bash
    npm run build
    npx cap add ios # First time only
    npx cap sync ios
    ```
2.  Open in Xcode:
    ```bash
    npx cap open ios
    ```
3.  In Xcode, select your Team, signing certificate, and click **Run**.

## 7. Automated Cloud Builds (GitHub Actions)
We have configured a GitHub Action to automatically build the **iOS IPA** file whenever you push to `main` or `master`.

### Prerequisites for Automation:
You must add the following **Repository Secrets** in your GitHub Settings:
*   `P12_BASE64`: Your Distribution certificate in Base64.
*   `MOBILEPROVISION_BASE64`: Your Provisioning Profile in Base64.
*   `P12_PASSWORD`: The password for the `.p12` file.
*   `TEAM_ID`: Your Apple Developer Team ID.

The status of the build can be tracked in the **"Actions"** tab of your repository. Once finished, you can download the `.ipa` from the build artifacts.
