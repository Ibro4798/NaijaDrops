cd "C:\Users\T450s\Documents\logistics welcome soon page\naijadrops-web"
# Repair Git Pointer
echo 09f2324f0369b36ea03fa5d1592535a2fb95e694 > .git/HEAD
# Commit and Push
git add .
git commit -m "Final UX Polish: Android UI fixes, touch-responsive clicks, and role-based redirect"
git push origin HEAD:main
