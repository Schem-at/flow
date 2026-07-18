// Multiplies a and b and stores result in RAM[0]

// Data
.a
DW 3
.b
DW 2

// Instructions
IMM R2 0 .a
IMM R3 0 .b

.start
ADD R1 R2
DEC R3 R3
BRA 0b00 0b11 .start // Branch to start if not zero flag
IMM R4 0 0
STR R1 R4

.end
BRA 0b00 0b00 .end
