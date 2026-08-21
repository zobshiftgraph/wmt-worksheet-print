# WMT Pay Period Printer

Print every day of a WMT **Work Sheet View** pay period as one document. OS names are merged into the **Sup** column; OS requests are merged onto the same day. One page per day.

## Use it from GitHub Pages

After the site is published, open:

**https://thom7215.github.io/wmt-worksheet-print/**

1. Show your bookmarks bar (`Ctrl+Shift+B`).
2. Drag **Print Pay Period** onto the bar.
3. In WMT: **Views → Work Sheet View**, click any date in the pay period.
4. Click the bookmark, wait for the days to load, then **Print**.

If you update the bookmark later, delete the old one and drag it from that page again.

## Use it from a clone

```bash
git clone https://github.com/thom7215/wmt-worksheet-print.git
```

Open `index.html` (or `Start Worksheet Printer.bat` on Windows) and drag the bookmark from there.

## Notes

- Works in Chrome or Edge while you are logged into WMT.
- Stay on the WMT tab while days load. Allow pop-ups if Print is blocked.
- This only reads Worksheet View. It does not change the schedule.
