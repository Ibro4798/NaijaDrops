NAIJADROPS - WALLET + THEME FIXES (v2)
======================================
Run these ONE AT A TIME from the repo root. Wait for each to finish before the next.

1. (tidy, once) remove the old scripts that were committed by mistake:
     git rm -r -q Wallet
     git commit -m "remove old wallet scripts"
2. Unzip so this exists:  WalletV2\00-Run-All.ps1   (next to package.json, not in a double folder)
3. Keep it out of git:
     Add-Content .git/info/exclude "WalletV2/"
4. Run (this CHECKS every file first and changes nothing if anything is off):
     powershell -ExecutionPolicy Bypass -File .\WalletV2\00-Run-All.ps1
   You want:  "Step 1 of 2" ... "Check passed" twice ... "Step 2 of 2" ... "All done".
   If you see STOPPED or "Check failed": nothing was changed. Send me the file names it prints.
5. npm run build      (confirm /wallet appears in the route list and there are no errors)
6. git add -A
   git commit -m "Wallet, dark legal pages, footer cleanup, scheduling flash fix"
   git push

WHAT IT DOES: see WALLET_SPEC.md. The wallet database is already live; it does nothing until this is deployed.
