# Summary of everything the new header needs to include

## Links

- Site name + logo -> Home page
- News -> News page
- Donate -> Donation page
- Leaderboard -> Leaderboard page




For light and dark themes, store colors once per theme as a small set of semantic variables, and every element in the entire codebase references those variables.

EXAMPLE THEME (for us we will have significantly fewer variables to start out):

/* src/client/css/themes.css */

:root,
[data-theme="light"] {
  --c-bg:            #f0efea;
  --c-surface:       #ffffff;
  --c-surface-raise: #e8e7e2;
  --c-surface-sink:  #dddcd6;
  --c-text:          #1a1a1a;
  --c-text-2:        #4a4a4a;
  --c-text-muted:    #757575;
  --c-text-inv:      #f0efea;
  --c-border:        #cccccc;
  --c-border-focus:  #5a9a5a;
  --c-brand:         #5a9a5a;
  --c-brand-hover:   #4a8a4a;
  --c-link:          #2060a0;
  --c-focus-ring:    rgba(90, 154, 90, 0.4);
  --c-error:         #cc2222;
  --c-warning:       #b06000;
  --c-success:       #2a7a2a;
}

[data-theme="dark"] {
  --c-bg:            #18181a;
  --c-surface:       #222226;
  --c-surface-raise: #2c2c30;
  --c-surface-sink:  #141416;
  --c-text:          #e2e2da;
  --c-text-2:        #b0b0a8;
  --c-text-muted:    #787870;
  --c-text-inv:      #18181a;
  --c-border:        #3a3a3e;
  --c-border-focus:  #70ba70;
  --c-brand:         #6aaa6a;
  --c-brand-hover:   #7aba7a;
  --c-link:          #6090d0;
  --c-focus-ring:    rgba(106, 170, 106, 0.4);
  --c-error:         #ee5555;
  --c-warning:       #e09020;
  --c-success:       #50aa50;
}