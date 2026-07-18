// Fibonacci — the canonical validator for the Carbon assembler (tony-ist's
// carbon1dot1-assembler). Emits the Fibonacci sequence (1,2,3,5,8,13,…) on
// port $0 forever. Byte-exact vs the reference assembler.
LIM R0 0
LIM R2 1
.loop
ADD R2
PST $0
ADR R2
RST R3
RLD R2
PST $0
RLD R3
BRC JMP .loop
