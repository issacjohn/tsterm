# ASA model benchmark

Generated: 2026-11-23T13:28:10.179Z
Questions per model: 300

## Results

| Model | Correct | Accuracy | Median latency | Tokens/sec | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| qwen3:8b | 289/300 | 96.3% | 197 ms | 79.6 | 0 |
| deepseek-r1:8b | 285/300 | 95.0% | 3794 ms | 73.5 | 0 |

## By category

| Model | Category | Correct | Questions | Accuracy |
| --- | --- | ---: | ---: | ---: |
| qwen3:8b | last | 26 | 35 | 74.3% |
| qwen3:8b | position | 183 | 184 | 99.5% |
| qwen3:8b | second | 33 | 33 | 100.0% |
| qwen3:8b | first | 35 | 35 | 100.0% |
| qwen3:8b | cleanup | 12 | 13 | 92.3% |
| deepseek-r1:8b | last | 30 | 35 | 85.7% |
| deepseek-r1:8b | position | 184 | 184 | 100.0% |
| deepseek-r1:8b | second | 33 | 33 | 100.0% |
| deepseek-r1:8b | first | 34 | 35 | 97.1% |
| deepseek-r1:8b | cleanup | 4 | 13 | 30.8% |

## Method

- Every question includes the numbered TSTerm ASA runbook context; the expected command is present.
- The model must return the exact requested command, not a paraphrase.
- Exact command matching, no LLM judge. Temperature 0, 8K context, 512 output tokens.
- Qwen3 runs with thinking disabled; DeepSeek R1 uses its normal reasoning mode.

## Sample failures

### qwen3:8b / cleanup
Question: Using the runbook context above, return the exact cleanup command.
Expected: `undebug crypto ikev2 protocol`
Answer: ```text undebug crypto ikev2 platform ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show eigrp neighbors`
Answer: ```text debug eigrp neighbors ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show aaa-server`
Answer: ```bash debug radius all ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show logging | include IPsec`
Answer: ```bash show crypto ipsec sa peer {peer} ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show logging | include DHCP`
Answer: ```text show dhcpd statistics ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show capture TSTCAP`
Answer: 4. capture TSTCAP interface {iface} access-list TSTCAP_ACL

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show logging | include ICMP`
Answer: ```bash debug icmp trace ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show monitor-interface`
Answer: ```text show failover interface ```

### qwen3:8b / position
Question: Using the runbook context above, return command number 5 exactly.
Expected: `show logging | include IKE|IPSEC`
Answer: ```text show crypto ikev1 sa ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show logging | include webvpn`
Answer: ```bash show vpn-sessiondb anyconnect ```

### qwen3:8b / last
Question: Using the runbook context above, return the exact last primary command.
Expected: `show capture TSTCAP`
Answer: ```text capture TSTCAP type asp-drop all ```

### deepseek-r1:8b / cleanup
Question: Using the runbook context above, return the exact cleanup command.
Expected: `undebug eigrp packets`
Answer: 
