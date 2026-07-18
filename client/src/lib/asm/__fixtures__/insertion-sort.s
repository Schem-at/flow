// Sorts an array of length N using insertion sort

PLD R4 0
MOV R1 R4

.input
PLD R2 0
STR R2 R3
INC R3 R3
DEC R1 R1
BRA 0 0b11 .input // if not zero

IMM R3 0 0

.loop1
SOP R3 0 // PUSH R3

.loop2
LOD R1 R3
DEC R3 R3
LOD R2 R3
SUB R1 R2
BRA 1 1 .loop2_end // if cout == 1 or if R1 > R2
CAL 0 0 .swap
.loop2_end
BRA 0 0b11 .loop2 // if not zero

SOP R3 1 // POP R3
INC R3 R3
MOV R2 R3
SUB R2 R4
BRA 0 0b11 .loop1 // if not zero

IMM R3 0 0

.output
LOD R2 R3
PST R2 0
INC R3 R3
MOV R2 R3
SUB R2 R4
BRA 0 0b11 .output // if not zero

.end
BRA 0 0 .end

// swaps RAM[R3] and RAM[R3+1]
.swap
LOD R1 R3
INC R3 R3
LOD R2 R3
STR R1 R3
DEC R3 R3
STR R2 R3
RET
