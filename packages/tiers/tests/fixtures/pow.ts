export const ALTCHA_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head><title>Form with Altcha</title></head>
<body>
  <form id="login-form">
    <input type="text" name="username" />
    <altcha-widget challengeurl="/api/altcha/challenge">
      <input type="checkbox" id="altcha_checkbox" />
      <input type="hidden" name="altcha" value="" />
    </altcha-widget>
    <button type="submit">Submit</button>
  </form>
</body>
</html>`

export const FRIENDLY_CAPTCHA_WIDGET_HTML = `<!DOCTYPE html>
<html>
<head><title>Form with Friendly Captcha</title></head>
<body>
  <form id="contact-form">
    <input type="email" name="email" />
    <div class="frc-captcha" data-sitekey="FCMTEST123456">
      <div class="frc-container">
        <button type="button" class="frc-button">Click to start verification</button>
        <input type="hidden" name="frc-captcha-solution" value="" />
      </div>
    </div>
    <button type="submit">Send</button>
  </form>
</body>
</html>`

export const POW_INTERSTITIAL_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Security Check</title>
  <script src="/pow/worker.js"></script>
</head>
<body>
  <div id="challenge-container">
    <h1>Checking your browser before accessing the website</h1>
    <p>Please wait while your device completes the proof of work challenge...</p>
    <div id="progress">Computing challenge...</div>
  </div>
</body>
</html>`

export const ALTCHA_INTERSTITIAL_HTML = `<!DOCTYPE html>
<html>
<head><title>Verification Required</title></head>
<body>
  <div class="security-check">
    <h1>Security Check</h1>
    <p>Protected by Altcha Proof-of-Work verification.</p>
    <altcha-widget challengeurl="/challenge"></altcha-widget>
  </div>
</body>
</html>`
