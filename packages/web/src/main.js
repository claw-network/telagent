const outputEl = document.querySelector('#output');

const byId = (id) => document.querySelector(`#${id}`);

async function callApi(method, path, body) {
  const base = byId('api-base').value.trim().replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  outputEl.textContent = JSON.stringify(
    {
      status: response.status,
      payload,
    },
    null,
    2,
  );
}

byId('btn-self').addEventListener('click', () => {
  void callApi('GET', '/api/v1/identities/self');
});

byId('btn-create-group').addEventListener('click', () => {
  void callApi('POST', '/api/v1/groups', {
    creatorDid: byId('creator-did').value.trim(),
    groupId: byId('group-id').value.trim(),
    groupDomain: byId('group-domain').value.trim(),
    domainProofHash: byId('domain-proof-hash').value.trim(),
    initialMlsStateHash: byId('mls-hash').value.trim(),
  });
});

byId('btn-invite').addEventListener('click', () => {
  const groupId = byId('invite-group-id').value.trim();
  void callApi('POST', `/api/v1/groups/${encodeURIComponent(groupId)}/invites`, {
    inviteId: byId('invite-id').value.trim(),
    inviterDid: byId('inviter-did').value.trim(),
    inviteeDid: byId('invitee-did').value.trim(),
    mlsCommitHash: byId('invite-mls-hash').value.trim(),
  });
});

byId('btn-send-message').addEventListener('click', () => {
  void callApi('POST', '/api/v1/messages', {
    senderDid: byId('sender-did').value.trim(),
    conversationId: byId('conversation-id').value.trim(),
    conversationType: byId('conversation-type').value,
    targetDomain: byId('target-domain').value.trim(),
    mailboxKeyId: byId('mailbox-key').value.trim(),
    sealedHeader: byId('sealed-header').value.trim(),
    ciphertext: byId('ciphertext').value.trim(),
    contentType: byId('content-type').value,
    ttlSec: 2592000,
  });
});
