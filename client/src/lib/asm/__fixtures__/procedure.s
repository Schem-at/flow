// Procedure to load RAM[0], add argument to it, then store back

IMM R1 0 5
SOP R1 0
CAL 0 0 .procedure

IMM R1 0 7
SOP R1 0
CAL 0 0 .procedure

.end
BRA 0b00 0b00 .end

.procedure
IMM R2 0 0
LOD R1 R2 // R1 = RAM[0]
SOP R2 1
ADD R1 R2 // R1 += arg1
IMM R2 0 0
STR R1 R2 // RAM[0] = R1
RET