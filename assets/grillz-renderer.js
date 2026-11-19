/* ═══════════════════════════════════════════════════════════════════════════
 *  EGYGRILLZ — GRILLZ RENDERER
 *  ---------------------------------------------------------------------------
 *  Draws the piece the client is configuring: real metal, real stones, the
 *  laser pattern, and a soft shadow so it reads as a physical object.
 *
 *  This is deliberate 2D canvas work, not a photo and not WebGL. That choice
 *  buys three things that matter on a phone at the counter:
 *    · it stays razor sharp at any size and on any screen
 *    · it weighs nothing (no textures, no models, no HTTP requests)
 *    · it re-renders instantly while a slider moves
 *
 *  Realism comes from stacking what a real polished surface shows you:
 *      1. metal GRADIENT     — light falls off down the curved face
 *      2. ENVIRONMENT         — a soft studio (bright ceiling, dark floor,
 *                               two rim lights) reflected in the surface
 *      3. ANISOTROPIC streaks — highlights that follow the tooth's curvature
 *      4. a cast shadow + contact shadow so it sits on the page
 *
 *  Plating tints the metal itself rather than the light, so gold, rose gold,
 *  black gold, chrome and titanium keep their own characteristic response.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* Tooth outlines, taken from the smile chart so the render matches the chart
     directly above it. Keyed by FDI number. */
  const TOOTH_PATHS = {"18":"M 82.904 202.43 C 85.223 197.361 85.223 191.443 84.063 184.995 C 82.904 178.835 79.426 172.675 74.788 168.057 C 70.141 164.973 65.503 163.438 62.025 163.438 C 58.547 163.438 53.899 164.973 49.262 168.057 C 44.624 172.675 41.136 178.835 39.977 184.995 C 38.818 191.443 38.818 197.361 41.136 202.43 C 42.932 203.808 46.113 204.832 49.967 205.5 C 53.787 206.163 57.94 203.132 62.385 203.096 C 66.598 203.062 71.107 206.057 74.662 205.396 C 78.251 204.727 81.202 203.738 82.904 202.43","17":"M 144.186 205.079 C 146.57 198.873 146.57 191.56 145.378 183.726 C 144.186 176.148 140.611 167.735 135.843 162.679 C 131.066 159.315 125.106 157.63 120.339 157.63 C 117.955 157.63 113.178 157.63 111.986 157.63 C 107.218 157.63 102.441 159.315 97.673 162.679 C 92.906 167.735 89.33 176.148 88.128 183.726 C 86.937 191.56 86.937 198.873 89.33 205.079 C 91.973 207 96.634 208.388 102.194 209.244 C 106.897 209.968 112.001 206.339 117.313 206.301 C 122.011 206.267 126.924 209.907 131.101 209.277 C 136.758 208.425 141.509 207.026 144.186 205.079","16":"M 209.691 205.388 C 212.082 199.171 212.082 191.732 210.886 182.902 C 209.691 174.319 206.095 165.737 200.117 160.59 C 195.335 157.161 189.348 155.443 184.566 155.443 C 182.175 155.443 177.383 155.443 174.992 155.443 C 170.21 155.443 164.232 157.161 159.44 160.59 C 153.463 165.737 149.876 174.319 148.681 182.902 C 147.475 191.732 147.475 199.171 149.876 205.388 C 152.333 207.544 156.844 209.146 162.353 210.194 C 167.443 211.163 174.623 206.694 180.587 206.716 C 187.143 206.742 192.485 211.16 197.984 210.042 C 203.142 208.993 207.348 207.442 209.691 205.388","15":"M 256.782 204.406 C 259.085 198.664 259.085 192.601 257.929 184.682 C 256.782 176.535 254.47 167.487 249.864 160.249 C 245.258 154.821 240.643 153.011 236.038 153.011 C 231.423 153.011 226.818 154.821 222.213 160.249 C 217.598 167.487 215.294 176.535 214.139 184.682 C 212.991 192.601 212.991 198.664 215.294 204.406 C 216.799 206.122 220.319 205.812 223.359 206.781 C 226.274 207.711 228.666 209.95 232.225 210.194 C 234.235 210.331 236.289 210.358 238.316 210.277 C 241.689 210.141 243.587 207.185 246.508 206.442 C 250.38 205.458 254.983 206.457 256.782 204.406","14":"M 303.983 204.425 C 306.289 198.702 306.289 191.644 305.131 183.859 C 303.983 174.841 301.667 165.823 297.055 158.609 C 293.592 155.001 288.98 153.198 285.516 153.198 C 284.358 153.198 282.052 153.198 280.904 153.198 C 277.44 153.198 272.819 155.001 269.365 158.609 C 264.743 165.823 262.437 174.841 261.279 183.859 C 260.131 191.644 260.131 198.702 262.437 204.425 C 264.647 206.934 270.457 206.42 275.546 207.328 C 278.529 207.86 280.29 210.339 283.527 210.321 C 286.38 210.305 290.887 207.854 293.541 207.41 C 298.836 206.526 301.703 207.012 303.983 204.425","13":"M 342.048 206.152 C 343.337 203.576 347.141 205.032 347.283 201.823 C 347.42 198.734 347.103 195.378 346.48 191.804 C 345.22 182.952 342.68 172.599 338.89 162.239 C 335.09 153.603 326.617 153.913 326.617 153.913 C 326.617 153.913 319.9 153.603 316.11 162.239 C 312.31 172.599 309.78 182.952 308.51 191.804 C 307.812 195.838 307.501 199.596 307.792 203.004 C 308.026 205.751 311.759 206.522 312.888 208.777 C 316.235 212.649 321.074 216.224 328.756 216.001 C 335.601 215.802 341.935 206.211 341.935 206.211","12":"M 384.596 205.384 C 386.693 202.255 386.693 198.416 385.644 193.038 C 384.596 185.894 382.51 177.718 379.365 170.91 C 376.231 165.456 372.048 162.733 367.866 162.733 C 363.683 162.733 359.501 165.456 356.356 170.91 C 353.222 177.718 351.125 185.894 350.088 193.038 C 349.04 198.416 349.04 202.255 351.125 205.384 C 357.405 209.423 378.329 209.423 384.596 205.384","11":"M 449.499 212.112 C 452.192 207.962 452.192 201.807 450.85 193.601 C 449.499 184.045 446.814 173.023 442.77 161.995 C 438.734 152.811 430.663 149.135 419.898 149.135 C 409.133 149.135 401.061 152.811 397.026 161.995 C 392.981 173.023 390.297 184.045 388.945 193.601 C 387.603 201.807 387.603 207.962 390.297 212.112 C 398.368 218.469 441.428 218.469 449.499 212.112","21":"M 452.001 212.112 C 449.308 207.962 449.308 201.807 450.65 193.601 C 452.001 184.045 454.686 173.023 458.73 161.995 C 462.766 152.811 470.837 149.135 481.602 149.135 C 492.367 149.135 500.439 152.811 504.474 161.995 C 508.519 173.023 511.203 184.045 512.555 193.601 C 513.897 201.807 513.897 207.962 511.203 212.112 C 503.132 218.469 460.072 218.469 452.001 212.112","22":"M 516.904 205.384 C 514.807 202.255 514.807 198.416 515.856 193.038 C 516.904 185.894 518.99 177.718 522.135 170.91 C 525.269 165.456 529.452 162.733 533.634 162.733 C 537.817 162.733 541.999 165.456 545.144 170.91 C 548.278 177.718 550.375 185.894 551.412 193.038 C 552.46 198.416 552.46 202.255 550.375 205.384 C 544.095 209.423 523.171 209.423 516.904 205.384","23":"M 559.452 206.152 C 558.163 203.576 554.359 205.032 554.217 201.823 C 554.08 198.734 554.397 195.378 555.02 191.804 C 556.28 182.952 558.82 172.599 562.61 162.239 C 566.41 153.603 574.883 153.913 574.883 153.913 C 574.883 153.913 581.6 153.603 585.39 162.239 C 589.19 172.599 591.72 182.952 592.99 191.804 C 593.688 195.838 593.999 199.596 593.708 203.004 C 593.474 205.751 589.741 206.522 588.612 208.777 C 585.265 212.649 580.426 216.224 572.744 216.001 C 565.899 215.802 559.565 206.211 559.565 206.211","24":"M 597.517 204.425 C 595.211 198.702 595.211 191.644 596.369 183.859 C 597.517 174.841 599.833 165.823 604.445 158.609 C 607.908 155.001 612.52 153.198 615.984 153.198 C 617.142 153.198 619.448 153.198 620.596 153.198 C 624.06 153.198 628.681 155.001 632.135 158.609 C 636.757 165.823 639.063 174.841 640.221 183.859 C 641.369 191.644 641.369 198.702 639.063 204.425 C 636.853 206.934 631.043 206.42 625.954 207.328 C 622.971 207.86 621.21 210.339 617.973 210.321 C 615.12 210.305 610.613 207.854 607.959 207.41 C 602.664 206.526 599.797 207.012 597.517 204.425","25":"M 644.718 204.406 C 642.415 198.664 642.415 192.601 643.571 184.682 C 644.718 176.535 647.03 167.487 651.636 160.249 C 656.242 154.821 660.857 153.011 665.462 153.011 C 670.077 153.011 674.682 154.821 679.287 160.249 C 683.902 167.487 686.206 176.535 687.361 184.682 C 688.509 192.601 688.509 198.664 686.206 204.406 C 684.701 206.122 681.181 205.812 678.141 206.781 C 675.226 207.711 672.834 209.95 669.275 210.194 C 667.265 210.331 665.211 210.358 663.184 210.277 C 659.811 210.141 657.913 207.185 654.992 206.442 C 651.12 205.458 646.517 206.457 644.718 204.406","26":"M 691.809 205.388 C 689.418 199.171 689.418 191.732 690.614 182.902 C 691.809 174.319 695.405 165.737 701.383 160.59 C 706.165 157.161 712.152 155.443 716.934 155.443 C 719.325 155.443 724.117 155.443 726.508 155.443 C 731.29 155.443 737.268 157.161 742.06 160.59 C 748.037 165.737 751.624 174.319 752.819 182.902 C 754.025 191.732 754.025 199.171 751.624 205.388 C 749.167 207.544 744.656 209.146 739.147 210.194 C 734.057 211.163 726.877 206.694 720.913 206.716 C 714.357 206.742 709.015 211.16 703.516 210.042 C 698.358 208.993 694.152 207.442 691.809 205.388","27":"M 757.314 205.079 C 754.93 198.873 754.93 191.56 756.122 183.726 C 757.314 176.148 760.889 167.735 765.657 162.679 C 770.434 159.315 776.394 157.63 781.161 157.63 C 783.545 157.63 788.322 157.63 789.514 157.63 C 794.282 157.63 799.059 159.315 803.827 162.679 C 808.594 167.735 812.17 176.148 813.372 183.726 C 814.563 191.56 814.563 198.873 812.17 205.079 C 809.527 207 804.866 208.388 799.306 209.244 C 794.603 209.968 789.499 206.339 784.187 206.301 C 779.489 206.267 774.576 209.907 770.399 209.277 C 764.742 208.425 759.991 207.026 757.314 205.079","28":"M 818.596 202.43 C 816.277 197.361 816.277 191.443 817.437 184.995 C 818.596 178.835 822.074 172.675 826.712 168.057 C 831.359 164.973 835.997 163.438 839.475 163.438 C 842.953 163.438 847.601 164.973 852.238 168.057 C 856.876 172.675 860.364 178.835 861.523 184.995 C 862.682 191.443 862.682 197.361 860.364 202.43 C 858.568 203.808 855.387 204.832 851.533 205.5 C 847.713 206.163 843.56 203.132 839.115 203.096 C 834.902 203.062 830.393 206.057 826.838 205.396 C 823.249 204.727 820.298 203.738 818.596 202.43","48":"M 82.255 322.948 C 84.587 327.637 84.587 332.391 83.416 337.717 C 82.255 343.464 78.77 349.212 74.115 353.518 C 69.468 356.392 64.813 357.832 60.167 357.832 C 55.512 357.832 50.866 356.392 46.21 353.518 C 41.555 349.212 38.07 343.464 36.908 337.717 C 35.747 332.391 35.747 327.637 38.07 322.948 C 39.052 322.21 39.361 319.497 41.374 318.872 C 46.629 317.241 51.53 320.86 59.478 321.14 C 64.076 321.301 72.172 317.699 75.529 318.166 C 79.95 318.782 81.605 321.743 82.255 322.948","47":"M 157.11 319.641 C 159.6 324.935 159.6 330.49 158.35 336.583 C 157.11 343.015 153.39 350.161 148.42 354.453 C 143.46 358.026 137.25 359.453 131.04 359.453 C 127.32 359.453 117.39 359.453 114.91 359.453 C 108.7 359.453 102.49 358.026 97.53 354.453 C 92.56 350.161 88.84 343.015 87.6 336.583 C 86.36 330.563 86.36 325.105 88.84 319.903 C 90.488 318.933 91.815 317.345 95.836 316.657 C 102.887 315.449 111.965 319.406 122.14 319.374 C 129.52 319.351 138.128 315.114 143.818 315.502 C 152.756 316.112 158.347 318.87 157.11 319.641","46":"M 231.394 319.725 C 233.809 324.98 233.809 330.507 232.602 336.599 C 231.394 343.863 227.763 351.126 221.727 355.489 C 216.888 359.12 210.843 360.577 204.807 360.577 C 201.175 360.577 192.715 360.577 190.301 360.577 C 184.255 360.577 178.219 359.12 173.381 355.489 C 167.335 351.126 163.713 343.863 162.506 336.599 C 161.299 330.507 161.299 324.98 163.713 319.725 C 165.717 318.328 166.807 315.555 171.946 314.644 C 177.839 313.6 184.122 318.577 192.321 318.709 C 199.835 318.831 209.258 314.045 215.146 314.528 C 224.262 315.274 231.394 318.344 231.394 319.725","45":"M 282.064 320.006 C 284.441 325.311 284.441 331.85 283.257 339.053 C 282.064 346.546 278.514 354.876 273.78 359.869 C 269.036 364.038 264.293 365.7 259.559 365.7 C 254.815 365.7 250.081 364.038 245.337 359.869 C 240.603 354.876 237.043 346.546 235.86 339.053 C 234.676 331.85 234.676 325.311 237.043 320.006 C 238.928 318.36 243.299 318.543 247.772 317.214 C 251.703 316.047 255.549 313.257 260.102 313.297 C 265.066 313.34 266.324 315.62 270.314 316.968 C 274.216 318.286 280.889 318.657 282.064 320.006","44":"M 328.362 319.173 C 330.484 324.439 330.484 330.915 329.423 338.102 C 328.362 346.364 325.179 354.634 320.926 359.589 C 316.682 363.72 312.43 365.377 308.185 365.377 C 303.933 365.377 299.688 363.72 295.436 359.589 C 291.183 354.634 288 346.364 286.939 338.102 C 285.878 330.915 285.878 324.439 288 319.173 C 289.51 317.716 295.292 317.73 298.905 316.254 C 302.484 314.79 303.881 311.83 308.136 311.848 C 312.514 311.867 313.866 314.203 317.424 315.541 C 321.653 317.13 327.754 317.851 328.362 319.173","43":"M 364.927 312.442 C 365.292 313.168 372.628 316.731 372.892 317.51 C 374.476 322.174 373.15 325.111 372.056 331.364 C 370.78 340.149 368.218 350.479 363.115 359.084 C 359.277 365.971 346.508 365.971 342.68 359.084 C 337.566 350.479 335.014 340.149 333.738 331.364 C 332.452 324.067 329.9 320.492 332.462 315.418 C 335.706 315.164 338.604 312.992 340.622 312.219 C 346.782 309.856 348.117 307.587 353.337 308.171 C 358.142 308.708 362.611 310.307 365.227 312.924","42":"M 411.702 317.945 C 413.996 322.256 413.996 327.371 412.844 334.181 C 411.702 341.74 409.416 349.992 404.837 355.992 C 401.408 360.489 397.98 363.49 394.543 363.49 C 391.115 363.49 387.678 360.489 384.25 355.992 C 379.67 349.992 377.385 341.74 376.242 334.181 C 375.099 327.371 375.099 322.256 377.385 317.945 C 383.107 314.348 405.988 314.348 411.702 317.945","41":"M 449.914 317.952 C 452.22 322.348 452.22 327.559 451.067 334.477 C 449.914 342.091 447.599 349.699 444.14 355.788 C 440.681 360.352 437.212 362.637 433.753 362.637 C 430.285 362.637 426.826 360.352 423.358 355.788 C 419.898 349.699 417.592 342.091 416.439 334.477 C 415.286 327.559 415.286 322.348 417.592 317.952 C 420.551 316.064 427.212 316.585 434.024 316.635 C 440.483 316.682 447.104 316.162 449.914 317.952","31":"M 451.586 317.952 C 449.28 322.348 449.28 327.559 450.433 334.477 C 451.586 342.091 453.901 349.699 457.36 355.788 C 460.819 360.352 464.288 362.637 467.747 362.637 C 471.215 362.637 474.674 360.352 478.142 355.788 C 481.602 349.699 483.908 342.091 485.061 334.477 C 486.214 327.559 486.214 322.348 483.908 317.952 C 480.949 316.064 474.288 316.585 467.476 316.635 C 461.017 316.682 454.396 316.162 451.586 317.952","32":"M 489.798 317.945 C 487.504 322.256 487.504 327.371 488.656 334.181 C 489.798 341.74 492.084 349.992 496.663 355.992 C 500.092 360.489 503.52 363.49 506.957 363.49 C 510.385 363.49 513.822 360.489 517.25 355.992 C 521.83 349.992 524.115 341.74 525.258 334.181 C 526.401 327.371 526.401 322.256 524.115 317.945 C 518.393 314.348 495.512 314.348 489.798 317.945","33":"M 536.573 312.442 C 536.208 313.168 528.872 316.731 528.608 317.51 C 527.024 322.174 528.35 325.111 529.444 331.364 C 530.72 340.149 533.282 350.479 538.385 359.084 C 542.223 365.971 554.992 365.971 558.82 359.084 C 563.934 350.479 566.486 340.149 567.762 331.364 C 569.048 324.067 571.6 320.492 569.038 315.418 C 565.794 315.164 562.896 312.992 560.878 312.219 C 554.718 309.856 553.383 307.587 548.163 308.171 C 543.358 308.708 538.889 310.307 536.273 312.924","34":"M 573.138 319.173 C 571.016 324.439 571.016 330.915 572.077 338.102 C 573.138 346.364 576.321 354.634 580.574 359.589 C 584.818 363.72 589.07 365.377 593.315 365.377 C 597.567 365.377 601.812 363.72 606.064 359.589 C 610.317 354.634 613.5 346.364 614.561 338.102 C 615.622 330.915 615.622 324.439 613.5 319.173 C 611.99 317.716 606.208 317.73 602.595 316.254 C 599.016 314.79 597.619 311.83 593.364 311.848 C 588.986 311.867 587.634 314.203 584.076 315.541 C 579.847 317.13 573.746 317.851 573.138 319.173","35":"M 619.436 320.006 C 617.059 325.311 617.059 331.85 618.243 339.053 C 619.436 346.546 622.986 354.876 627.72 359.869 C 632.464 364.038 637.207 365.7 641.941 365.7 C 646.685 365.7 651.419 364.038 656.163 359.869 C 660.897 354.876 664.457 346.546 665.64 339.053 C 666.824 331.85 666.824 325.311 664.457 320.006 C 662.572 318.36 658.201 318.543 653.728 317.214 C 649.797 316.047 645.951 313.257 641.398 313.297 C 636.434 313.34 635.176 315.62 631.186 316.968 C 627.284 318.286 620.611 318.657 619.436 320.006","36":"M 670.106 319.725 C 667.691 324.98 667.691 330.507 668.898 336.599 C 670.106 343.863 673.737 351.126 679.773 355.489 C 684.612 359.12 690.657 360.577 696.693 360.577 C 700.325 360.577 708.785 360.577 711.199 360.577 C 717.245 360.577 723.281 359.12 728.119 355.489 C 734.165 351.126 737.787 343.863 738.994 336.599 C 740.201 330.507 740.201 324.98 737.787 319.725 C 735.783 318.328 734.693 315.555 729.554 314.644 C 723.661 313.6 717.378 318.577 709.179 318.709 C 701.665 318.831 692.242 314.045 686.354 314.528 C 677.238 315.274 670.106 318.344 670.106 319.725","37":"M 744.39 319.641 C 741.9 324.935 741.9 330.49 743.15 336.583 C 744.39 343.015 748.11 350.161 753.08 354.453 C 758.04 358.026 764.25 359.453 770.46 359.453 C 774.18 359.453 784.11 359.453 786.59 359.453 C 792.8 359.453 799.01 358.026 803.97 354.453 C 808.94 350.161 812.66 343.015 813.9 336.583 C 815.14 330.563 815.14 325.105 812.66 319.903 C 811.012 318.933 809.685 317.345 805.664 316.657 C 798.613 315.449 789.535 319.406 779.36 319.374 C 771.98 319.351 763.372 315.114 757.682 315.502 C 748.744 316.112 743.153 318.87 744.39 319.641","38":"M 819.245 322.948 C 816.913 327.637 816.913 332.391 818.084 337.717 C 819.245 343.464 822.73 349.212 827.385 353.518 C 832.032 356.392 836.687 357.832 841.333 357.832 C 845.988 357.832 850.634 356.392 855.29 353.518 C 859.945 349.212 863.43 343.464 864.592 337.717 C 865.753 332.391 865.753 327.637 863.43 322.948 C 862.448 322.21 862.139 319.497 860.126 318.872 C 854.871 317.241 849.97 320.86 842.022 321.14 C 837.424 321.301 829.328 317.699 825.971 318.166 C 821.55 318.782 819.895 321.743 819.245 322.948"};

  const VB = { w: 900, h: 520 };
  const PATH_CACHE = {};

  /* ───────────────────────── metal palettes ─────────────────────────
     [top highlight, upper body, mid, lower shadow, deepest, specular] */
  const METALS = {
    gold:     { hi:'#fffdf4', body:'#f0d585', mid:'#d4a94e', low:'#8f6716', deep:'#4a3407', spec:'#ffffff' },
    silver:   { hi:'#ffffff', body:'#f2f5f9', mid:'#cdd3db', low:'#8b939d', deep:'#4f555d', spec:'#ffffff' },
    chrome:   { hi:'#ffffff', body:'#eef1f5', mid:'#c2c8d0', low:'#7a828c', deep:'#3b4046', spec:'#ffffff' },
    titanium: { hi:'#f6f7f9', body:'#d2d5da', mid:'#a4a9b0', low:'#6c7178', deep:'#3c4045', spec:'#ffffff' },
  };

  /* Plating tints the metal, not the light. */
  const PLATING_TINT = {
    yellowgold:    { over:'#f2d273', alpha:0.50, hi:'#fffbe8' },
    whitegold:     { over:'#eef3f8', alpha:0.60, hi:'#ffffff' },
    rosegold:      { over:'#eab39c', alpha:0.55, hi:'#fff2ea' },
    blackgold:     { over:'#26282c', alpha:0.80, hi:'#9aa0a8' },
    silverplating: { over:'#e7ebf1', alpha:0.55, hi:'#ffffff' },
  };

  const KARAT_TINT = { '10':'#d7b263', '14':'#e0bd6b', '18':'#e8c268', '21':'#dcb35b', '22':'#d3a84e' };

  const ENAMEL_COLORS = ['#1b1b1b', '#f4f4f4', '#b21e2b', '#1f4fa8', '#2f7d4f', '#c9a145'];

  /* ───────────────────────── colour helpers ───────────────────────── */

  function hex2rgb(h) {
    const s = String(h || '#000').replace('#', '');
    const v = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
    return [parseInt(v.slice(0,2),16) || 0, parseInt(v.slice(2,4),16) || 0, parseInt(v.slice(4,6),16) || 0];
  }
  function rgb2hex(r) {
    return '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  function mix(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex([0,1,2].map(i => A[i] + (B[i]-A[i]) * t));
  }
  function lighter(c, amt) {
    const A = hex2rgb(c);
    return rgb2hex(A.map(v => v + (255 - v) * amt));
  }
  function darker(c, amt) {
    const A = hex2rgb(c);
    return rgb2hex(A.map(v => v * (1 - amt)));
  }

  function metalFor(material, plating, karat) {
    const base = METALS[material] || METALS.chrome;
    const out = Object.assign({}, base);
    if (material === 'gold' && KARAT_TINT[String(karat)]) out.body = KARAT_TINT[String(karat)];
    const t = PLATING_TINT[plating];
    if (t) {
      out.body = mix(out.body, t.over, t.alpha);
      out.mid  = mix(out.mid,  t.over, t.alpha * 0.92);
      out.low  = mix(out.low,  t.over, t.alpha * 0.72);
      out.deep = mix(out.deep, t.over, t.alpha * 0.45);
      if (t.hi) out.hi = t.hi;
    }
    return out;
  }

  /* ───────────────────────── teeth ───────────────────────── */

  function toothPath(fdi) {
    const key = String(fdi);
    if (!TOOTH_PATHS[key]) return null;
    if (!PATH_CACHE[key]) PATH_CACHE[key] = new Path2D(TOOTH_PATHS[key]);
    return PATH_CACHE[key];
  }

  /* The chart speaks FDI (18..48); the calculator speaks UR1/UL1. */
  function fdiOf(id) {
    const m = /^([UL][RL])([1-8])$/.exec(String(id || '').toUpperCase());
    if (!m) return null;
    const q = { UR:1, UL:2, LR:3, LL:4 }[m[1]];
    return Number(String(q) + m[2]);
  }

  /* ───────────────────────── the metal surface ─────────────────────────

     One tooth, drawn as a curved cap. The gradient runs top-to-bottom because
     a grillz cap is lit from above; the environment band and the streaks are
     what stop it reading as a flat tint. */
  function drawMetalTooth(ctx, path, bbox, m, level) {
    const x = bbox.x, y = bbox.y, w = bbox.w, h = bbox.h;

    ctx.save();
    ctx.clip(path);

    /* A polished metal cap is a MIRROR. What you see is not the metal's own
       colour but the room reflected in it, and a room has hard edges: a
       bright ceiling, a dark band where the eye-level horizon sits, a bright
       floor light, and near-black where the cap rolls away at the bottom.
       The zones are banded with tight transitions because a mirror does not
       blur — a smooth gradient is exactly what makes fake metal look like
       plastic. */

    /* 1 — the vertical reflection profile of the studio */
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0.00, m.hi);          /* ceiling, straight on */
    g.addColorStop(0.14, m.hi);
    g.addColorStop(0.20, m.body);        /* softbox */
    g.addColorStop(0.32, m.body);
    g.addColorStop(0.38, m.mid);
    g.addColorStop(0.44, m.low);         /* the horizon */
    g.addColorStop(0.50, m.deep);
    g.addColorStop(0.55, m.deep);
    g.addColorStop(0.60, m.low);
    g.addColorStop(0.68, m.mid);         /* floor light bouncing up */
    g.addColorStop(0.80, m.mid);
    g.addColorStop(0.90, mix(m.mid, m.low, 0.55));
    g.addColorStop(1.00, darker(m.low, 0.50));   /* the roll-off at the lip */
    ctx.fillStyle = g;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    /* 2 — the horizon is not a straight line. It dips in the middle because a
       cylindrical cap curves away faster at its edges: an arc is what tells
       the eye the surface is round. */
    const hz = y + h * 0.50;
    ctx.beginPath();
    ctx.moveTo(x - 2, hz + h * 0.11);
    ctx.quadraticCurveTo(x + w / 2, hz - h * 0.10, x + w + 2, hz + h * 0.11);
    ctx.lineTo(x + w + 2, hz + h * 0.20);
    ctx.quadraticCurveTo(x + w / 2, hz - h * 0.01, x - 2, hz + h * 0.20);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fill();

    /* 3 — edge falloff. The sides roll away from the light, and the roll is
       tight: a hairline of bright rim, then a rapid fall. */
    ['L', 'R'].forEach((side) => {
      const x0 = side === 'L' ? x : x + w;
      const x1 = side === 'L' ? x + w * 0.20 : x + w * 0.80;
      const edge = ctx.createLinearGradient(x0, y, x1, y);
      edge.addColorStop(0.00, 'rgba(255,255,255,0.55)');   /* the rim catches light */
      edge.addColorStop(0.12, 'rgba(0,0,0,0.30)');
      edge.addColorStop(0.55, 'rgba(0,0,0,0.10)');
      edge.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.fillStyle = edge;
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    });

    /* 4 — the specular hit. Hard, small, off-centre. This one detail does more
       for "metal" than anything else in the function. */
    const sx0 = x + w * 0.42, sy0 = y + h * 0.16;
    const spec = ctx.createRadialGradient(sx0, sy0, 0, sx0, sy0, w * 0.20);
    spec.addColorStop(0.00, 'rgba(255,255,255,1)');
    spec.addColorStop(0.20, 'rgba(255,255,255,0.62)');
    spec.addColorStop(0.45, 'rgba(255,255,255,0.10)');
    spec.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = spec;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    /* 5 — a second, smaller hot spot down near the lip: the light coming back
       off the floor. Two highlights, not one, is what reads as polished. */
    const bx = x + w * 0.36, by = y + h * 0.845;
    const bounce = ctx.createRadialGradient(bx, by, 0, bx, by, w * 0.30);
    bounce.addColorStop(0.00, 'rgba(255,255,255,0.26)');
    bounce.addColorStop(0.55, 'rgba(255,255,255,0.06)');
    bounce.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = bounce;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    /* 6 — deeper design levels get one crisp machined groove, not stripes. */
    if (Number(level) >= 3) {
      const fy = y + h * 0.615;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.10, fy - h * 0.012);
      ctx.quadraticCurveTo(x + w * 0.5, fy + h * 0.010, x + w * 0.90, fy - h * 0.012);
      ctx.lineWidth = Math.max(0.7, h * 0.014);
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.10, fy - h * 0.012 - Math.max(0.5, h * 0.012));
      ctx.quadraticCurveTo(x + w * 0.5, fy + h * 0.010 - Math.max(0.5, h * 0.012), x + w * 0.90, fy - h * 0.012 - Math.max(0.5, h * 0.012));
      ctx.lineWidth = Math.max(0.5, h * 0.008);
      ctx.strokeStyle = 'rgba(255,255,255,0.42)';
      ctx.stroke();
    }

    /* 7 — the wall of the casting, clipped inside the silhouette so the tooth
       keeps its own outline instead of wearing a sticker border. */
    const wall = ctx.createLinearGradient(x, y, x + w, y);
    wall.addColorStop(0.00, 'rgba(0,0,0,0.26)');
    wall.addColorStop(0.10, 'rgba(0,0,0,0.05)');
    wall.addColorStop(0.86, 'rgba(0,0,0,0.03)');
    wall.addColorStop(1.00, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = wall;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    /* 8 — a hairline of catchlight on the top-facing edge only. */
    ctx.beginPath();
    ctx.moveTo(x + w * 0.20, y + h * 0.115);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.005, x + w * 0.80, y + h * 0.115);
    ctx.lineWidth = Math.max(0.6, w * 0.016);
    ctx.strokeStyle = 'rgba(255,255,255,0.50)';
    ctx.stroke();

    ctx.restore();
  }


  /* ───────────────────────── stones ─────────────────────────

     A stone is a faceted disc: dark table, bright crown facets, a rim of
     sparkle. At UI size this reads convincingly and costs nothing. */
  function drawStone(ctx, cx, cy, r, opts) {
    const o = opts || {};
    const cut = o.cut || 'round';

    /* A face-up brilliant is LIGHT — it is the table catching the whole
       studio — broken by a few hard dark arrows near the girdle where the
       stone turns away, and closed by a fine dark rim. Getting that
       light-with-dark-arrows balance is what stops it looking like a pearl. */
    const GLINT   = 'rgba(255,255,255,0.99)';
    const LIGHT   = 'rgba(240,244,249,0.97)';
    const PALE    = 'rgba(206,214,224,0.95)';
    const SHADE   = 'rgba(146,155,167,0.72)';
    const ARROW   = 'rgba(58,64,74,0.80)';

    /* Below a few pixels the facet geometry turns to mush, so a tiny stone
       gets a single bright dot with a dark rim instead — far cleaner than a
       smeared brilliant, and it is what the eye reads at that scale. */
    if (r < 2.2) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(238,243,249,0.96)';
      ctx.fill();
      ctx.lineWidth = Math.max(0.25, r * 0.30);
      ctx.strokeStyle = 'rgba(70,77,88,0.55)';
      ctx.stroke();
      if (r > 1.1) {
        ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.30, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(cx, cy);

    const sx = ({ marquise:0.76, pear:0.88, oval:1.16, emerald:0.88,
                  baguette:0.68, taperedbaguette:0.74, radiant:0.96 }[cut]) || 1;
    const sy = ({ marquise:1.32, pear:1.12, oval:0.84, emerald:1.18,
                  baguette:0.54, taperedbaguette:0.64, radiant:1.04 }[cut]) || 1;

    ctx.save();
    ctx.scale(sx, sy);

    /* 1. body — bright, slightly cooler towards the lower right */
    const body = ctx.createLinearGradient(-r * 0.45, -r, r * 0.55, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.45, '#eef2f7');
    body.addColorStop(0.78, '#cfd7e1');
    body.addColorStop(1, '#aab3bf');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();

    /* 2. the arrows: four to eight narrow dark wedges, each edged by a bright
       one. Narrow is the whole trick — wide wedges read as a pinwheel. */
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI * 0.62;
      /* dark arrow: a thin triangle from the girdle pointing at the table */
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.10) * r * 1.02, Math.sin(a - 0.10) * r * 1.02);
      ctx.lineTo(Math.cos(a + 0.10) * r * 1.02, Math.sin(a + 0.10) * r * 1.02);
      ctx.lineTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
      ctx.closePath();
      ctx.fillStyle = ARROW;
      ctx.fill();

      /* and the pale wedge that sits between two arrows */
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + 0.10) * r * 1.02, Math.sin(a + 0.10) * r * 1.02);
      ctx.lineTo(Math.cos(a + Math.PI / N - 0.05) * r * 1.02, Math.sin(a + Math.PI / N - 0.05) * r * 1.02);
      ctx.lineTo(Math.cos(a + Math.PI / N - 0.05) * r * 0.50, Math.sin(a + Math.PI / N - 0.05) * r * 0.50);
      ctx.lineTo(Math.cos(a + 0.18) * r * 0.50, Math.sin(a + 0.18) * r * 0.50);
      ctx.closePath();
      ctx.fillStyle = PALE;
      ctx.fill();
    }

    /* 3. the table: flat, bright, with a hairline edge */
    const tr = r * 0.50;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI * 0.62;
      const px = Math.cos(a) * tr, py = Math.sin(a) * tr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const table = ctx.createLinearGradient(-tr, -tr, tr * 0.7, tr);
    table.addColorStop(0, '#ffffff');
    table.addColorStop(0.60, '#f4f7fb');
    table.addColorStop(1, '#d6dee8');
    ctx.fillStyle = table;
    ctx.fill();
    ctx.lineWidth = Math.max(0.35, r * 0.045);
    ctx.strokeStyle = SHADE;
    ctx.stroke();

    /* 4. one hot pinpoint, upper left, clipped to the stone */
    const gx = -r * 0.30, gy = -r * 0.36;
    const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.70);
    gl.addColorStop(0, GLINT);
    gl.addColorStop(0.28, 'rgba(255,255,255,0.62)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

    /* 5. the stone turns away at the bottom right */
    const shade = ctx.createRadialGradient(r * 0.24, r * 0.34, r * 0.30,
                                           r * 0.24, r * 0.34, r * 1.12);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.76, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(40,46,54,0.30)');
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* 6. the girdle: a fine dark rim with a bright inner edge — this single
       line is what makes it look like a cut stone rather than a bubble */
    ctx.beginPath(); ctx.arc(0, 0, r * 0.955, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(0.4, r * 0.09);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(0.35, r * 0.07);
    ctx.strokeStyle = 'rgba(62,68,78,0.55)';
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  /* ───────────────────────── public API ───────────────────────── */

  /**
   * Paint the piece onto a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {Object} spec  see the header of this file
   */
  function draw(canvas, spec) {
    if (!canvas) return;
    /* Path2D is what makes the vector outlines reusable; without it (an old
       browser, or a test shim) the preview simply does not draw rather than
       breaking the calculator that embeds it. */
    if (typeof Path2D === 'undefined') return;
    const s = spec || {};
    const dpr = Math.min(3, global.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || canvas.width || 600;
    const cssH = Math.round(cssW * (VB.h / VB.w));
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (canvas.style) canvas.style.height = cssH + 'px';

    ON_IMAGE = typeof spec.onImageReady === 'function' ? spec.onImageReady : null;
    let ctx = null;
    try { ctx = canvas.getContext('2d'); } catch (e) { return; }
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const scale = cssW / VB.w;
    ctx.save();
    ctx.scale(scale, scale);

    const metal = metalFor(s.material, s.plating, s.karat);
    const ids = Array.isArray(s.teeth) && s.teeth.length ? s.teeth : [];
    const level = String(s.level || '1');

    /* which tooth is the "hero" — the one that gets the stone detail, so the
       render reads at a glance instead of turning into confetti */
    const heroId = s.heroTooth || ids[Math.min(2, Math.max(0, ids.length - 1))];

    /* The outlines live in the chart's own 900-wide frame, which leaves the
       piece sitting small in the middle. Measure the teeth that are actually
       in use and scale them up to fill the preview, so the client sees the
       metal rather than a lot of empty space around it. */
    let ux0 = Infinity, uy0 = Infinity, ux1 = -Infinity, uy1 = -Infinity;
    ids.forEach((id) => {
      const fdi = fdiOf(id);
      if (!fdi) return;
      const b = pathBounds(null, fdi);
      if (!b) return;
      ux0 = Math.min(ux0, b.x); uy0 = Math.min(uy0, b.y);
      ux1 = Math.max(ux1, b.x + b.w); uy1 = Math.max(uy1, b.y + b.h);
    });
    if (isFinite(ux0)) {
      const pad = Math.max(14, (ux1 - ux0) * 0.05);
      const bw = (ux1 - ux0) + pad * 2;
      const bh = (uy1 - uy0) + pad * 2;
      const k = Math.min(VB.w / bw, VB.h / bh, 2.4);
      /* a grill is one cast piece: squeeze the teeth horizontally so their
         edges meet instead of floating apart like separate stickers */
      const tight = ids.length > 1 ? 1.14 : 1;
      ctx.translate(VB.w / 2 - (ux0 + ux1) / 2 * k * tight, VB.h * 0.52 - (uy0 + uy1) / 2 * k);
      ctx.scale(k * tight, k);
    }

    ids.forEach((id) => {
      const fdi = fdiOf(id);
      if (!fdi) return;
      const path = toothPath(fdi);
      if (!path) return;

      /* bounds come from the outline itself so bevels scale with the tooth */
      const bb = pathBounds(path, fdi);
      drawMetalTooth(ctx, path, bb, metal, level);
      drawEnamel(ctx, path, bb, metal, s, id === heroId);
      drawStonesOnTooth(ctx, path, bb, metal, s, id === heroId);
      drawLaser(ctx, path, bb, metal, s, id === heroId);
    });

    ctx.restore();
  }

  /* Path2D has no getBBox, so keep the chart's per-tooth boxes. Derived once
     from the same path data by scanning its coordinates. */
  const BBOX = {};
  function pathBounds(path, fdi) {
    if (BBOX[fdi]) return BBOX[fdi];
    const d = TOOTH_PATHS[String(fdi)] || '';
    const nums = d.match(/-?\d+(?:\.\d+)?/g) || [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]), y = Number(nums[i + 1]);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const bb = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    BBOX[fdi] = bb;
    return bb;
  }

  function drawEnamel(ctx, path, bb, metal, s, hero) {
    if (!s.enamel || s.enamel === 'none') return;
    const seq = s.enamel === 'single' ? 1 : s.enamel === 'multi' ? 3 : 4;
    ctx.save();
    ctx.clip(path);
    for (let i = 0; i < seq; i++) {
      const c = ENAMEL_COLORS[i % ENAMEL_COLORS.length];
      const h = bb.h / seq;
      ctx.globalAlpha = s.enamel === 'master' ? 0.55 : 0.42;
      ctx.fillStyle = c;
      ctx.fillRect(bb.x, bb.y + i * h, bb.w, h);
    }
    ctx.globalAlpha = 1;
    /* enamel is glossy, so it takes a highlight band */
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = g;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.stroke(path);
    ctx.restore();
  }

  /* Stones are laid out across the tooth face. Accent = a few set stones;
     iced = a dense pavé lattice. A hero tooth shows the real stone size, the
     rest show a suggestion so the piece stays readable. */
  function drawStonesOnTooth(ctx, path, bb, metal, s, hero) {
    const acc = s.stones && s.stones.accent;
    const full = s.stones && s.stones.full;
    if (!acc && !full) return;

    ctx.save();
    ctx.clip(path);

    /* A real tooth is about 8.4 mm across, so the millimetre value the client
       picks is converted through the TOOTH's own width. That is what makes
       3 mm look like a 3 mm stone instead of a fixed dot. */
    const TOOTH_MM = 8.4;
    const pxPerMm = bb.w / TOOTH_MM;
    const mmOf = (v) => Math.max(0.5, Math.min(9, Number(v) || 1));
    const rAcc = (mmOf(acc && acc.size) / 2) * pxPerMm;
    const rFull = (mmOf(full && full.size) / 2) * pxPerMm;

    const cut = (acc && acc.cut) || 'round';

    /* A stone cannot be wider than the tooth it sits on. Past that point the
       real piece has fewer stones, so the size is clamped rather than letting
       the outline cut the stone in half. */
    const fit = (r, w, h) => Math.min(r, w * 0.34, h * 0.46);

    if (full) {
      /* Iced out: the stones tile the whole face. The radius comes from the
         chosen millimetre size, so a bigger size means fewer, larger stones —
         exactly what happens on a real piece. */
      const rf = fit(rFull, bb.w, bb.h / 2);
      const gap = Math.max(rf * 2.06, bb.w * 0.055);
      const cols = Math.max(2, Math.floor((bb.w * 0.96) / gap));
      const rows = Math.max(2, Math.floor((bb.h * 0.96) / (gap * 0.92)));
      const offX = bb.x + (bb.w - (cols - 1) * gap) / 2;
      const offY = bb.y + (bb.h - (rows - 1) * gap * 0.92) / 2;
      for (let ry = 0; ry < rows; ry++) {
        for (let cx = 0; cx < cols; cx++) {
          const x = offX + cx * gap + (ry % 2 ? gap / 2 : 0);
          const y = offY + ry * gap * 0.92;
          drawStone(ctx, x, y, rf * 0.94, { cut: 'round' });
        }
      }
    } else if (acc) {
      /* Accent stones down the centre in the chosen cut, sitting proud of the
         metal so their girdle catches the light. */
      const count = Math.max(1, Math.min(6, Number(acc.count) || 1));
      /* keep a real margin from the edge, then shrink the stone until the
         whole run fits between the incisal edge and the gum */
      const margin = bb.h * 0.09;
      const usable = Math.max(bb.h * 0.2, bb.h - margin * 2);
      let ra = fit(rAcc, bb.w, count > 1 ? usable / (count * 2.05) + bb.h * 0.08 : usable / 2);
      ra = Math.min(ra, usable / (count * 2.0));
      const pad = (bb.h - (usable)) / 2 + ra;
      const step = count > 1 ? (usable - ra * 2) / (count - 1) : 0;
      for (let i = 0; i < count; i++) {
        const y = count > 1 ? bb.y + pad + i * step : bb.y + bb.h * 0.46;
        const x = bb.x + bb.w / 2;
        /* a shallow seat shadow, then the stone */
        const seat = ctx.createRadialGradient(x, y + ra * 0.30, ra * 0.25,
                                              x, y + ra * 0.30, ra * 1.18);
        seat.addColorStop(0, 'rgba(0,0,0,0.26)');
        seat.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = seat;
        ctx.beginPath(); ctx.arc(x, y, ra * 1.18, 0, Math.PI * 2); ctx.fill();
        drawStone(ctx, x, y, ra, { cut });
      }
    }
    ctx.restore();
  }

  /* The laser pattern: text cut clean through (dark = the mouth behind) or
     filled with enamel, plus an uploaded image knocked back to black & white
     and used the same way. */
  /* Uploaded images arrive as data URLs. Wrap them in an <img> once and keep
     it, asking for one redraw when it finishes decoding. */
  const IMG_CACHE = new Map();
  let ON_IMAGE = null;
  function resolveImage(src) {
    if (!src) return null;
    if (typeof src !== 'string') return src.complete ? src : null;
    let rec = IMG_CACHE.get(src);
    if (!rec) {
      const img = new Image();
      rec = { img, ready: false };
      img.onload = () => {
        rec.ready = true;
        if (typeof ON_IMAGE === 'function') ON_IMAGE();
      };
      img.src = src;
      IMG_CACHE.set(src, rec);
    }
    return rec.ready ? rec.img : null;
  }

  function drawLaser(ctx, path, bb, metal, s, hero) {
    const L = s.laser;
    if (!L || L.mode === 'none') return;

    ctx.save();
    ctx.clip(path);

    const inset = bb.w * 0.12;
    const box = { x: bb.x + inset, y: bb.y + bb.h * 0.24, w: bb.w - inset * 2, h: bb.h * 0.52 };

    const pic = L.mode === 'image' ? resolveImage(L.image) : null;
    if (pic && pic.naturalWidth) {
      drawLaserImage(ctx, box, Object.assign({}, L, { image: pic }));
    } else if (L.mode === 'text' && L.text) {
      drawLaserText(ctx, box, L, bb);
    }

    ctx.restore();
  }

  function laserFillStyle(L, metal) {
    if (L.fill === 'enamel') {
      const c = L.color || ENAMEL_COLORS[0];
      return { color: c, shadow: null, alpha: 1 };
    }
    /* cut through: you see the shadow of the mouth, not a painted colour */
    return { color: 'rgba(18,16,14,0.88)', shadow: 'rgba(255,255,255,0.35)', alpha: 1 };
  }

  function drawLaserText(ctx, box, L, bb) {
    const st = laserFillStyle(L, null);
    const text = String(L.text).slice(0, 18);
    let size = box.h * 0.78;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    /* shrink to fit the tooth */
    for (let i = 0; i < 24; i++) {
      ctx.font = '700 ' + size.toFixed(1) + 'px "Space Grotesk", Inter, system-ui, sans-serif';
      if (ctx.measureText(text).width <= box.w) break;
      size *= 0.88;
    }
    /* the cut edge catches light */
    if (st.shadow) {
      ctx.fillStyle = st.shadow;
      ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + Math.max(0.6, size * 0.03));
    }
    ctx.fillStyle = st.color;
    ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2);
  }

  function drawLaserImage(ctx, box, L) {
    const st = laserFillStyle(L, null);
    const img = L.image;
    const ar = img.naturalWidth / img.naturalHeight;
    let w = box.w, h = w / ar;
    if (h > box.h) { h = box.h; w = h * ar; }
    const x = box.x + (box.w - w) / 2;
    const y = box.y + (box.h - h) / 2;

    /* Threshold the source to black & white so the cut is crisp, using an
       offscreen buffer. The dark areas become the cut. */
    const off = document.createElement('canvas');
    off.width = 220;
    off.height = Math.max(1, Math.round(220 / ar));
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.drawImage(img, 0, 0, off.width, off.height);
    try {
      const data = octx.getImageData(0, 0, off.width, off.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2];
        const v = lum < 128 ? 0 : 255;
        px[i] = px[i+1] = px[i+2] = v;
        px[i+3] = v === 0 ? 255 : 0;   /* keep only the dark pixels */
      }
      octx.putImageData(data, 0, 0);
    } catch (e) { /* a tainted canvas just falls through to the raw image */ }

    ctx.save();
    ctx.globalAlpha = 0.92;
    if (st.color.indexOf('rgba') === 0) {
      /* cut-through: draw the mask, then tint it dark */
      ctx.drawImage(off, x, y, w, h);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = st.color;
      ctx.fillRect(x, y, w, h);
    } else {
      ctx.drawImage(off, x, y, w, h);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = st.color;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  global.GrillzRenderer = {
    draw,
    metalFor,
    ENAMEL_COLORS,
    VB,
    fdiOf,
    TOOTH_PATHS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
