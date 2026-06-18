// Calculates Nth fibonacci number

IMM R1 0 0
IMM R2 0 1
IMM R3 0 6 // N

.loop
ADD R1 R2
SOP R1 0
MOV R1 R2
SOP R2 1
DEC R3 R3
BRA 0 0b11 .loop

PST R1 0

.end
BRA 0 0 .end