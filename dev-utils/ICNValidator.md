# ICN Game Notation Validator

A standalone tool for validating Infinite Chess Notation (ICN) game data. This tool helps identify bugs and invalid game notations by testing them through the conversion and formulation process.

## Purpose

This tool validates ICN game notations by:
1. Converting each ICN string using `icnconverter.ShortToLong_Format()`
2. Running the converted data through `gameformulator.formulateGame()`
3. Catching and categorizing any errors that occur

The tool helps you:
- Identify invalid game notations in bulk
- Distinguish between ICN converter errors and game formulator errors
- Track which variants have the most errors
- Debug specific problematic games

## Usage

### Prerequisites

The project must be either:
- Built (`npm run build`), OR
- Running the dev server (`npm run dev`)

This ensures the necessary JavaScript modules are available for import.

### Running the Tool

1. Open `dev-utils/ICNValidator.html` in a web browser
2. Click "Choose File" or drag and drop a JSON file containing an array of ICN strings
3. Click "Validate Games" to start the validation process
4. Review the results:
   - **Summary**: Shows total games, successful conversions, and error counts
   - **Errors by Variant**: Lists which variants have errors and how many
   - **Error Details**: Shows specific error messages for each failed game

### Input Format

The tool expects a JSON file containing an array of ICN strings:

```json
[
  "[Variant \"Classical\"] w 0/100 1 (8;Q,R,B,N|1;q,r,b,n) checkmate P1,2+|P2,2+|...",
  "[Variant \"Omega\"] w 0/100 1 (8,16;Q,R,B,N|1,9;q,r,b,n) checkmate P1,2+|...",
  "..."
]
```

Each string should be a complete ICN notation for a game.

### Example Test Data

You can create a test file with sample ICN notations. For example:

```json
[
  "[Variant \"Classical\"] w 1 (8|1) checkmate P1,2|P2,2|P3,2|P4,2|P5,2|P6,2|P7,2|P8,2|R1,1|N2,1|B3,1|Q4,1|K5,1|B6,1|N7,1|R8,1|p1,7|p2,7|p3,7|p4,7|p5,7|p6,7|p7,7|p8,7|r1,8|n2,8|b3,8|q4,8|k5,8|b6,8|n7,8|r8,8"
]
```

## Output

The tool provides several types of information:

1. **Activity Log**: Real-time logging of the validation process
2. **Validation Summary**: 
   - Total games processed
   - Number of successful validations
   - Number of ICN converter errors
   - Number of game formulator errors
3. **Errors by Variant**: Breakdown of error counts per game variant
4. **Error Details**: 
   - Game index
   - Error phase (icnconverter or formulator)
   - Error message
   - ICN snippet (first 100 characters)

## Error Types

- **ICN Converter Errors**: The ICN string could not be parsed into long format. This usually indicates:
  - Invalid ICN syntax
  - Malformed metadata
  - Invalid position notation
  
- **Game Formulator Errors**: The ICN was parsed successfully but the game could not be constructed. This usually indicates:
  - A move with invalid start coordinates (no piece exists there)
  - Illegal move sequences
  - Invalid variant configuration

## Notes

- This tool is **standalone** and does not affect other parts of the codebase
- Other scripts do not depend on this tool
- The tool runs entirely in the browser (client-side)
- Processing large numbers of games may take time; the progress bar shows current status
- The tool is designed for development and debugging purposes only

## Troubleshooting

**Module loading errors**: 
- Ensure you've run `npm run build` or `npm run dev`
- Check that the dist/ folder exists and contains the necessary JavaScript files
- If using the dev server, make sure it's running on the expected port

**JSON parsing errors**:
- Verify your JSON file is valid (use a JSON validator)
- Ensure the file contains an array of strings, not objects
- Check that each ICN string is properly escaped

**Browser compatibility**:
- The tool uses ES6 modules and requires a modern browser
- Chrome, Firefox, Safari, and Edge (Chromium) are supported
