// Tipos compartidos entre el servidor y el navegador

export type MemberStatus = 'pending' | 'accepted' | 'declined'

/** Info automática de un lugar, sin IA (se guarda en la tabla place_info) */
export interface PlaceInfo {
  history: string | null
  opening_hours: string | null
  website: string | null
  phone: string | null
  photo_url: string | null
  photo_credit: string | null
  wikipedia_url: string | null
}

/** Lo que recibe el viajero desde /api/v/:token */
export interface MemberTripView {
  member: {
    name: string
    status: MemberStatus
    responded_at: string | null
  }
  trip: {
    name: string
    destination: string | null
    description: string | null
    start_date: string
    end_date: string
    time_zone: string
    rsvp_deadline: string
  }
  is_open: boolean
  itinerary_published: boolean
  my_votes: number
  itinerary: MemberStop[]
}

export interface MemberStop {
  id: string
  day: string
  start_time: string | null
  end_time: string | null
  title: string
  notes: string | null
  place_id: string | null
}

export interface MemberPlace {
  id: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  category: string | null
  description: string | null
  photo_path: string | null
  /** URL pública de la foto (la arma el servidor) */
  photo_url: string | null
  votable: boolean
  in_itinerary: boolean
  info: PlaceInfo | null
  vote_count: number
  voted: boolean
}
