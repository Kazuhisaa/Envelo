# Envelo

Envelo acts as the payroll deduction a Filipino freelancer paid by foreign clients doesn't have: it sets aside government contributions from each client payment and remits them to each agency before the deadline.

## People and parties

**Freelancer**:
A Filipino worker paid by foreign clients who uses Envelo. Owns the envelopes.
_Avoid_: User, member, owner (when meaning the person)

**Client**:
A foreign customer who pays the freelancer through an invoice.
_Avoid_: Customer, employer

**Agency**:
One of the three government bodies that receive contributions: SSS, PhilHealth, Pag-IBIG.
_Avoid_: Merchant (that is the Noir-side role the agency plays), government, provider

**Agent**:
The Envelo component that decides how much to set aside and when to remit, within limits it cannot exceed.
_Avoid_: Bot, AI (when meaning the whole decision-maker)

## Money

**Invoice**:
A payment request the freelancer sends a client, paid through Velo checkout.
_Avoid_: Bill, checkout

**Client payment**:
Money a client pays against an invoice. The trigger for a set-aside.
_Avoid_: Payment (unqualified), salary, sahod

**Contribution**:
The amount a freelancer owes one agency for one period, fixed by the agency's rules and the freelancer's income.
_Avoid_: Premium, dues, kaltas

**Monthly Salary Credit (MSC)**:
The income bracket SSS assigns a freelancer for a period, on which the SSS contribution is computed.
_Avoid_: Salary bracket, salary credit

**Set-aside**:
The portion of a client payment the agent moves into an envelope.
_Avoid_: Kaltas, deduction, savings

**Envelope**:
A locked pot of money reserved for one agency's contributions, which only the agent can spend and only within its cap.
_Avoid_: Card, device, wallet, escrow (those are Noir-side names for its parts)

**Remittance**:
The agent paying one agency's contribution out of its envelope.
_Avoid_: Payment (unqualified), transfer

## Time

**Period**:
The calendar month a contribution covers.
_Avoid_: Cycle, term

**Deadline**:
The last moment a period's contribution can be remitted to an agency.
_Avoid_: Due date (when meaning the hard cutoff)

## Decisions

**Decision**:
The agent's choice for one envelope at one moment: pay, wait, or ask the freelancer, always with a reason the freelancer can read.
_Avoid_: Action, verdict
