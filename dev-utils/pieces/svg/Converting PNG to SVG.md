# Steps to converting a PNG to SVG #

This is the best method I've found, to retain high quality, yet remain highly compact!

1. Go to [SVG Trace](https://svgtrace.com/png-to-svg)

2. Drag in your desired PNG, approximately 512x512. Larger will lead to a larger ending file size.

3. Do NOT change any of the settings

4. Convert & Export

5. Open [Compress or Die](https://compress-or-die.com/svg)

6. Upload your new SVG

7. Drag "Decimal precision" to exactly 1. Checkmark "Extreme compression (experimental). 

8. Click "Generate Optimized Image". Download optimized image.

9. Open your SVG's code, find all `fill` attributes. Change the ones super close to white to `#ffffff`, and the ones super close to black to `#000000`.

10. See if it can further be compressed by running it through [SVG Minify](https://www.svgminify.com/).

11. Enjoy your optimized SVG.