// Mandelbrot for Carbon 1.1 — a MECHANICAL port of pseudogravity's BatPU-2
// Mandelbrot (gist 100cb013) to Carbon. BatPU-2's 16 registers are mapped to
// Carbon RAM[0..15] (virtual registers); every op is load->compute(acc)->store.
// Verified by simulation: renders a Mandelbrot identical to the BatPU-2 original
// (0-pixel diff). NOTE: at ~1.3 KB it exceeds the reference assembler's 8-bit
// BRC/CAL branch range (256 B); Carbon's PC is 15-bit, so the LOGIC is correct
// but burning to a real ROM needs extended branch encoding.
  // ldi r15 buffer_chars
  LIM R0 0
  LIM R1 15
  MST R1
  // ldi r6 32
  LIM R0 32
  LIM R1 6
  MST R1
.screen_x_loop
  // adi r6 -1
  LIM R1 6
  MLD R1
  LIM R2 255
  ADD R2
  LIM R1 6
  MST R1
  // ldi r7 32
  LIM R0 32
  LIM R1 7
  MST R1
.screen_y_loop
  // adi r7 -1
  LIM R1 7
  MLD R1
  LIM R2 255
  ADD R2
  LIM R1 7
  MST R1
  // str r15 r6 pixel_x_port
  LIM R1 6
  MLD R1
  PST $0
  // str r15 r7 pixel_y_port
  LIM R1 7
  MLD R1
  PST $1
  // str r15 r0 draw_pixel_port
  LIM R1 0
  MLD R1
  PST $2
  // str r15 r0 buffer_screen_port
  LIM R1 0
  MLD R1
  PST $4
  // cal .screen_to_graph
  CAL .screen_to_graph
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // cal .apply_brot_iter
  CAL .apply_brot_iter
  // ldi r1 192
  LIM R0 192
  LIM R1 1
  MST R1
  // and r1 r14 r0
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 1
  MLD R1
  AND R2
  // brh ne .bounds_exceeded
  BRC NEQ .bounds_exceeded
  // jmp .max_iter_reached
  BRC JMP .max_iter_reached
.bounds_exceeded
  // str r15 r6 pixel_x_port
  LIM R1 6
  MLD R1
  PST $0
  // str r15 r7 pixel_y_port
  LIM R1 7
  MLD R1
  PST $1
  // str r15 r0 clear_pixel_port
  LIM R1 0
  MLD R1
  PST $3
  // str r15 r0 buffer_screen_port
  LIM R1 0
  MLD R1
  PST $4
.max_iter_reached
  // cmp r7 r0
  LIM R1 0
  MLD R1
  RST R2
  LIM R1 7
  MLD R1
  CMP R2
  // brh ne .screen_y_loop
  BRC NEQ .screen_y_loop
  // cmp r6 r0
  LIM R1 0
  MLD R1
  RST R2
  LIM R1 6
  MLD R1
  CMP R2
  // brh ne .screen_x_loop
  BRC NEQ .screen_x_loop
  // hlt
  HLT
.breakpoint
  // lod r15 r3 controller_input_port
  PLD $7
  LIM R1 3
  MST R1
  // cmp r3 r0
  LIM R1 0
  MLD R1
  RST R2
  LIM R1 3
  MLD R1
  CMP R2
  // brh eq .breakpoint
  BRC EQ .breakpoint
.waiting_for_release
  // lod r15 r3 controller_input_port
  PLD $7
  LIM R1 3
  MST R1
  // cmp r3 r0
  LIM R1 0
  MLD R1
  RST R2
  LIM R1 3
  MLD R1
  CMP R2
  // brh ne .waiting_for_release
  BRC NEQ .waiting_for_release
  // ret
  RET
.apply_brot_iter
  // mov r4 r8
  LIM R1 4
  MLD R1
  LIM R1 8
  MST R1
  // mov r4 r9
  LIM R1 4
  MLD R1
  LIM R1 9
  MST R1
  // cal .mul_3_5_fixed_point
  CAL .mul_3_5_fixed_point
  // mov r11 r12
  LIM R1 11
  MLD R1
  LIM R1 12
  MST R1
  // mov r5 r8
  LIM R1 5
  MLD R1
  LIM R1 8
  MST R1
  // mov r5 r9
  LIM R1 5
  MLD R1
  LIM R1 9
  MST R1
  // cal .mul_3_5_fixed_point
  CAL .mul_3_5_fixed_point
  // sub r12 r11 r12
  LIM R1 11
  MLD R1
  RST R2
  LIM R1 12
  MLD R1
  SUB R2
  LIM R1 12
  MST R1
  // mov r4 r8
  LIM R1 4
  MLD R1
  LIM R1 8
  MST R1
  // mov r5 r9
  LIM R1 5
  MLD R1
  LIM R1 9
  MST R1
  // cal .mul_3_5_fixed_point
  CAL .mul_3_5_fixed_point
  // lsh r11 r13
  LIM R1 11
  MLD R1
  BSL 1
  LIM R1 13
  MST R1
  // cal .screen_to_graph
  CAL .screen_to_graph
  // add r12 r4 r4
  LIM R1 4
  MLD R1
  RST R2
  LIM R1 12
  MLD R1
  ADD R2
  LIM R1 4
  MST R1
  // add r13 r5 r5
  LIM R1 5
  MLD R1
  RST R2
  LIM R1 13
  MLD R1
  ADD R2
  LIM R1 5
  MST R1
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // mov r4 r2
  LIM R1 4
  MLD R1
  LIM R1 2
  MST R1
  // and r2 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 2
  MLD R1
  AND R2
  // brh eq .no_negate_real
  BRC EQ .no_negate_real
  // sub r0 r2 r2
  LIM R1 2
  MLD R1
  RST R2
  LIM R1 0
  MLD R1
  SUB R2
  LIM R1 2
  MST R1
.no_negate_real
  // mov r2 r14
  LIM R1 2
  MLD R1
  LIM R1 14
  MST R1
  // mov r5 r2
  LIM R1 5
  MLD R1
  LIM R1 2
  MST R1
  // and r2 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 2
  MLD R1
  AND R2
  // brh eq .no_negate_imag
  BRC EQ .no_negate_imag
  // sub r0 r2 r2
  LIM R1 2
  MLD R1
  RST R2
  LIM R1 0
  MLD R1
  SUB R2
  LIM R1 2
  MST R1
.no_negate_imag
  // add r2 r14 r14
  LIM R1 14
  MLD R1
  RST R2
  LIM R1 2
  MLD R1
  ADD R2
  LIM R1 14
  MST R1
  // ret
  RET
.screen_to_graph
  // mov r6 r4
  LIM R1 6
  MLD R1
  LIM R1 4
  MST R1
  // mov r7 r5
  LIM R1 7
  MLD R1
  LIM R1 5
  MST R1
  // lsh r4 r4
  LIM R1 4
  MLD R1
  BSL 1
  LIM R1 4
  MST R1
  // lsh r5 r5
  LIM R1 5
  MLD R1
  BSL 1
  LIM R1 5
  MST R1
  // adi r4 -48
  LIM R1 4
  MLD R1
  LIM R2 208
  ADD R2
  LIM R1 4
  MST R1
  // adi r5 -32
  LIM R1 5
  MLD R1
  LIM R2 224
  ADD R2
  LIM R1 5
  MST R1
  // ret
  RET
.mul_3_5_fixed_point
  // cal .mul8_8_16_signed
  CAL .mul8_8_16_signed
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // ldi r1 1
  LIM R0 1
  LIM R1 1
  MST R1
  // and r11 r1 r2
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 11
  MLD R1
  AND R2
  LIM R1 2
  MST R1
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // mov r10 r3
  LIM R1 10
  MLD R1
  LIM R1 3
  MST R1
  // lsh r3 r3
  LIM R1 3
  MLD R1
  BSL 1
  LIM R1 3
  MST R1
  // lsh r3 r3
  LIM R1 3
  MLD R1
  BSL 1
  LIM R1 3
  MST R1
  // lsh r3 r3
  LIM R1 3
  MLD R1
  BSL 1
  LIM R1 3
  MST R1
  // add r3 r11 r11
  LIM R1 11
  MLD R1
  RST R2
  LIM R1 3
  MLD R1
  ADD R2
  LIM R1 11
  MST R1
  // add r2 r11 r11
  LIM R1 11
  MLD R1
  RST R2
  LIM R1 2
  MLD R1
  ADD R2
  LIM R1 11
  MST R1
  // ret
  RET
.signed_rshift_r4
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // and r4 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 4
  MLD R1
  AND R2
  // rsh r4 r4
  LIM R1 4
  MLD R1
  BSR 1
  LIM R1 4
  MST R1
  // brh eq .no_leading_one_r4
  BRC EQ .no_leading_one_r4
  // add r4 r1 r4
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 4
  MLD R1
  ADD R2
  LIM R1 4
  MST R1
.no_leading_one_r4
  // ret
  RET
.signed_rshift_r5
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // and r5 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 5
  MLD R1
  AND R2
  // rsh r5 r5
  LIM R1 5
  MLD R1
  BSR 1
  LIM R1 5
  MST R1
  // brh eq .no_leading_one_r5
  BRC EQ .no_leading_one_r5
  // add r5 r1 r5
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 5
  MLD R1
  ADD R2
  LIM R1 5
  MST R1
.no_leading_one_r5
  // ret
  RET
.signed_rshift_r10
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // and r10 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 10
  MLD R1
  AND R2
  // rsh r10 r10
  LIM R1 10
  MLD R1
  BSR 1
  LIM R1 10
  MST R1
  // brh eq .no_leading_one_r10
  BRC EQ .no_leading_one_r10
  // add r10 r1 r10
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 10
  MLD R1
  ADD R2
  LIM R1 10
  MST R1
.no_leading_one_r10
  // ret
  RET
.signed_rshift_r11
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // and r11 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 11
  MLD R1
  AND R2
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // brh eq .no_leading_one_r11
  BRC EQ .no_leading_one_r11
  // add r11 r1 r11
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 11
  MLD R1
  ADD R2
  LIM R1 11
  MST R1
.no_leading_one_r11
  // ret
  RET
.signed_rshift_r10_r11
  // rsh r11 r11
  LIM R1 11
  MLD R1
  BSR 1
  LIM R1 11
  MST R1
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // ldi r2 1
  LIM R0 1
  LIM R1 2
  MST R1
  // and r10 r2 r0
  LIM R1 2
  MLD R1
  RST R2
  LIM R1 10
  MLD R1
  AND R2
  // brh eq .no_shift_across
  BRC EQ .no_shift_across
  // add r11 r1 r11
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 11
  MLD R1
  ADD R2
  LIM R1 11
  MST R1
.no_shift_across
  // cal .signed_rshift_r10
  CAL .signed_rshift_r10
  // ret
  RET
.mul8_8_16_signed
  // ldi r1 128
  LIM R0 128
  LIM R1 1
  MST R1
  // cmp r8 r1
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 8
  MLD R1
  CMP R2
  // brh ge .negate_A
  BRC GTEQ .negate_A
  // cmp r9 r1
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 9
  MLD R1
  CMP R2
  // brh ge .negate_B
  BRC GTEQ .negate_B
  // cal .mul8_8_16
  CAL .mul8_8_16
  // ret
  RET
.negate_A
  // sub r0 r8 r8
  LIM R1 8
  MLD R1
  RST R2
  LIM R1 0
  MLD R1
  SUB R2
  LIM R1 8
  MST R1
  // cmp r9 r1
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 9
  MLD R1
  CMP R2
  // brh ge .negate_AB
  BRC GTEQ .negate_AB
  // jmp .negate_res
  BRC JMP .negate_res
.negate_AB
  // sub r0 r9 r9
  LIM R1 9
  MLD R1
  RST R2
  LIM R1 0
  MLD R1
  SUB R2
  LIM R1 9
  MST R1
  // cal .mul8_8_16
  CAL .mul8_8_16
  // ret
  RET
.negate_B
  // sub r0 r9 r9
  LIM R1 9
  MLD R1
  RST R2
  LIM R1 0
  MLD R1
  SUB R2
  LIM R1 9
  MST R1
.negate_res
  // cal .mul8_8_16
  CAL .mul8_8_16
  // not r10 r10
  LIM R1 10
  MLD R1
  LIM R2 255
  XOR R2
  LIM R1 10
  MST R1
  // not r11 r11
  LIM R1 11
  MLD R1
  LIM R2 255
  XOR R2
  LIM R1 11
  MST R1
  // adi r11 1
  LIM R1 11
  MLD R1
  LIM R2 1
  ADD R2
  LIM R1 11
  MST R1
  // brh lt .negate_res_no_carry
  BRC LT .negate_res_no_carry
  // adi r10 1
  LIM R1 10
  MLD R1
  LIM R2 1
  ADD R2
  LIM R1 10
  MST R1
.negate_res_no_carry
  // ret
  RET
.mul8_8_16
  // ldi r1 1
  LIM R0 1
  LIM R1 1
  MST R1
  // cmp r8 r9
  LIM R1 9
  MLD R1
  RST R2
  LIM R1 8
  MLD R1
  CMP R2
  // brh ge .skip_swap
  BRC GTEQ .skip_swap
  // xor r8 r9 r8
  LIM R1 9
  MLD R1
  RST R2
  LIM R1 8
  MLD R1
  XOR R2
  LIM R1 8
  MST R1
  // xor r8 r9 r9
  LIM R1 9
  MLD R1
  RST R2
  LIM R1 8
  MLD R1
  XOR R2
  LIM R1 9
  MST R1
  // xor r8 r9 r8
  LIM R1 9
  MLD R1
  RST R2
  LIM R1 8
  MLD R1
  XOR R2
  LIM R1 8
  MST R1
.skip_swap
  // xor r10 r10 r10
  LIM R1 10
  MLD R1
  RST R2
  LIM R1 10
  MLD R1
  XOR R2
  LIM R1 10
  MST R1
  // xor r11 r11 r11
  LIM R1 11
  MLD R1
  RST R2
  LIM R1 11
  MLD R1
  XOR R2
  LIM R1 11
  MST R1
  // xor r3 r3 r3
  LIM R1 3
  MLD R1
  RST R2
  LIM R1 3
  MLD R1
  XOR R2
  LIM R1 3
  MST R1
.mul_loop
  // and r9 r1 r0
  LIM R1 1
  MLD R1
  RST R2
  LIM R1 9
  MLD R1
  AND R2
  // brh z  .skip_add
  BRC EQ .skip_add
  // add r10 r3 r10
  LIM R1 3
  MLD R1
  RST R2
  LIM R1 10
  MLD R1
  ADD R2
  LIM R1 10
  MST R1
  // add r11 r8 r11
  LIM R1 8
  MLD R1
  RST R2
  LIM R1 11
  MLD R1
  ADD R2
  LIM R1 11
  MST R1
  // brh nc .skip_add
  BRC LT .skip_add
  // inc r10
  LIM R1 10
  MLD R1
  LIM R2 1
  ADD R2
  LIM R1 10
  MST R1
.skip_add
  // rsh r9 r9
  LIM R1 9
  MLD R1
  BSR 1
  LIM R1 9
  MST R1
  // lsh r3 r3
  LIM R1 3
  MLD R1
  BSL 1
  LIM R1 3
  MST R1
  // lsh r8 r8
  LIM R1 8
  MLD R1
  BSL 1
  LIM R1 8
  MST R1
  // brh nc .skip_carry
  BRC LT .skip_carry
  // inc r3
  LIM R1 3
  MLD R1
  LIM R2 1
  ADD R2
  LIM R1 3
  MST R1
.skip_carry
  // cmp r9 r0
  LIM R1 0
  MLD R1
  RST R2
  LIM R1 9
  MLD R1
  CMP R2
  // brh ne .mul_loop
  BRC NEQ .mul_loop
  // ret
  RET
