# Security Detection Testing Instructions

## Problem Description
The extension is not detecting security headers from www.edu.tw despite the headers being present in the response.

## Debug Tools Available

### 1. edu.tw Specific Test Tool
**URL**: `chrome-extension://[your-extension-id]/test-edu-tw-headers.html`

**Features**:
- Automated test for www.edu.tw
- System status checks
- Storage data inspection
- Debug log analysis
- Manual security checks
- Request simulation

**Usage**:
1. Open the extension popup
2. Get the extension ID from the URL
3. Navigate to: `chrome-extension://[extension-id]/test-edu-tw-headers.html`
4. Follow the step-by-step testing process

### 2. General Security Debug Tool
**URL**: `chrome-extension://[your-extension-id]/debug-security-detection.html`

**Features**:
- Test any URL
- System diagnostics
- Comprehensive debugging
- Manual security simulation

## Testing Steps

### Step 1: Basic System Check
1. Open the debug tool
2. Click "Check System Status"
3. Click "Check Security Manager"
4. Verify all components are working

### Step 2: Test edu.tw Detection
1. Open the edu.tw test tool
2. Click "測試 www.edu.tw"
3. Wait for results
4. Check if security data is detected

### Step 3: Check Console Logs
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for logs starting with `[SecurityManager]` or `[SecurityDetectionModule]`
4. Check for any errors or warnings

### Step 4: Manual Verification
1. Visit www.edu.tw in a new tab
2. Open DevTools > Network tab
3. Reload the page
4. Check the main document request's response headers
5. Verify security headers are present

### Step 5: Storage Inspection
1. In the debug tool, click "Get Storage Data"
2. Check if any security data is stored
3. Look for entries starting with `security_tab_`

## Expected Console Log Flow

When working correctly, you should see:
```
[SecurityManager] Security check request for https://www.edu.tw (Tab: 123)
[SecurityManager] Executing security check for https://www.edu.tw
[SecurityDetectionModule] Processing security headers for https://www.edu.tw (Type: main_frame, Tab: 123)
[SecurityDetectionModule] Parsed 15 headers from response
[SecurityDetectionModule] Storing detection result for tab 123, score: 75/100
[SecurityDetectionModule] Storage key: security_tab_123
[SecurityDetectionModule] Successfully stored result for tab 123
[SecurityManager] Security check completed for https://www.edu.tw, score: 75/100
```

## Common Issues and Solutions

### Issue 1: No Security Check Logs
**Symptoms**: No `[SecurityManager]` logs appear
**Solution**: Check if security listener is active with "Check Listeners"

### Issue 2: Headers Not Parsed
**Symptoms**: `Parsed 0 headers from response`
**Solution**: Check if webRequest has responseHeaders permission

### Issue 3: Storage Not Working
**Symptoms**: Storage operations fail
**Solution**: Check extension permissions and storage API availability

### Issue 4: Security Manager Not Initialized
**Symptoms**: `Security manager not available`
**Solution**: Check if all security modules are loaded via importScripts

## Debugging Commands

### Check Extension ID
```javascript
chrome.runtime.id
```

### Check Storage Contents
```javascript
chrome.storage.local.get(null, (items) => {
  console.log('All storage:', items);
  const securityData = {};
  Object.keys(items).forEach(key => {
    if (key.startsWith('security_')) {
      securityData[key] = items[key];
    }
  });
  console.log('Security data:', securityData);
});
```

### Manual Security Check
```javascript
chrome.runtime.sendMessage({
  type: 'GET_SECURITY_STATUS'
}, (response) => {
  console.log('Security status:', response);
});
```

## Next Steps

1. **Run the edu.tw test tool** to get specific results
2. **Check console logs** for detailed debugging information
3. **Verify storage data** is being created
4. **Report findings** with specific error messages or log outputs

The enhanced logging will help identify exactly where the security detection is failing.