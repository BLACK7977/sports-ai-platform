export type MatchCoachView = {
  id: string;
  teamId: string;
  location: "home" | "away";
  fullName: string;
  imageUrl: string | null;
  imageIsPlaceholder: boolean;
  nationality: string | null;
  dateOfBirth: string | null;
};

export type MatchVenueView = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  capacity: number | null;
  surface: string | null;
  imageUrl: string | null;
};

export type PersistedMatchContext = {
  coaches: MatchCoachView[];
  venue: MatchVenueView | null;
};

export type NormalizedMatchContext = {
  fixtureExternalId: string;
  coaches: Array<{
    id: string; externalId: string; participantExternalId: string;
    location: "home" | "away"; fullName: string; imageUrl: string | null;
    imageIsPlaceholder: boolean; nationalityId: string | null;
    nationality: string | null; dateOfBirth: string | null;
  }>;
  venue: null | {
    id: string; externalId: string; name: string; city: string | null;
    address: string | null; capacity: number | null; surface: string | null;
    imageUrl: string | null; latitude: number | null; longitude: number | null;
  };
};
