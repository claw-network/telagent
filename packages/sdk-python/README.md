# telagent-sdk-python (Beta)

Python SDK beta for TelAgent `/api/v1/*`.

## Install (editable / local)

```bash
cd packages/sdk-python
python3 -m pip install -e .
```

## Quickstart

```python
from telagent_sdk import TelagentSdk

sdk = TelagentSdk(base_url="https://node-a.telagent.dev")

group = sdk.create_group(
    {
        "creatorDid": "did:claw:zAlice",
        "groupId": "0x" + "a" * 64,
        "groupDomain": "alpha.tel",
        "domainProofHash": "0x" + "b" * 64,
        "initialMlsStateHash": "0x" + "c" * 64,
    }
)

envelope = sdk.send_message(
    {
        "senderDid": "did:claw:zAlice",
        "conversationId": f"group:{group['group']['groupId']}",
        "conversationType": "group",
        "targetDomain": "alpha.tel",
        "mailboxKeyId": "mls-key-v1",
        "sealedHeader": "0x11",
        "ciphertext": "0x22",
        "contentType": "text",
        "ttlSec": 3600,
    }
)
print(envelope["seq"])
```

## Notes

- API base path is fixed to `/api/v1/*`.
- Successful responses are parsed from `{data, links?}` envelopes.
- RFC7807 responses are raised as `TelagentSdkError`.
