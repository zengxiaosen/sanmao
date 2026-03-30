export function getDailyState(state, currentDate) {
  if (!state || state.date !== currentDate) {
    return {
      date: currentDate,
      viewed: 0
    };
  }

  return state;
}

export function incrementViews(state) {
  return {
    ...state,
    viewed: state.viewed + 1
  };
}

export function getCandidatesForViewer(viewer, candidates) {
  return candidates.filter((candidate) => candidate.gender !== viewer.gender);
}

export function getCurrentCandidate(candidates) {
  return candidates[0] || null;
}

export function registerLike({ viewerId, candidateId, likesMap, likedIds }) {
  const nextLikedIds = [...likedIds, candidateId];
  const candidateLikes = likesMap[candidateId] || [];
  const matched = candidateLikes.includes(viewerId);

  return {
    matched,
    likedIds: nextLikedIds,
    matches: matched ? [candidateId] : []
  };
}

export function getChatThread(matchId, chats) {
  return chats[matchId] || [];
}

export function getProfilesByIds(ids, profiles) {
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return ids.map((id) => profileMap.get(id)).filter(Boolean);
}

export function appendChatMessage({ chats, matchId, senderId, text }) {
  const nextText = text.trim();
  if (!nextText) {
    return chats;
  }

  const thread = chats[matchId] || [];

  return {
    ...chats,
    [matchId]: [
      ...thread,
      {
        from: senderId,
        text: nextText
      }
    ]
  };
}

export function mergeProfileUpdate(profile, updates) {
  const nextProfile = { ...profile };

  Object.entries(updates).forEach(([key, value]) => {
    nextProfile[key] = typeof value === "string" ? value.trim() : value;
  });

  return nextProfile;
}
