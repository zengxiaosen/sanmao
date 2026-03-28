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
