-- The badge catalogue.
--
-- Tone matters here. These are meant to be handed out generously and read out loud
-- in a group chat, so the set leans towards turning up, having a laugh and the
-- occasional moment of brilliance, rather than towards ranking people by ability.
-- Note that showing up reliably is rewarded as richly as scoring, on purpose.

insert into public.badges (code, name, description, emoji, tier, sort_order) values
  -- Turning up
  ('debut',           'Debut',              'Played your first Wednesday.',                       '🎬', 'bronze',    10),
  ('first_in',        'First In',           'First to say yes on the team sheet.',                '⚡', 'bronze',    11),
  ('streak_5',        'Ever Present',       'Five Wednesdays in a row.',                          '📅', 'silver',    12),
  ('streak_10',       'Iron Man',           'Ten Wednesdays in a row. Remarkable.',               '🦾', 'gold',      13),
  ('caps_25',         'Quarter Century',    'Twenty-five appearances.',                           '🎖️', 'gold',      14),
  ('caps_50',         'Club Legend',        'Fifty appearances for the Wednesday league.',        '🗿', 'legendary', 15),
  ('rescuer',         'The Rescuer',        'Came off the waitlist and saved the numbers.',       '🛟', 'silver',    16),

  -- Scoring
  ('first_goal',      'Off the Mark',       'Scored your first league goal.',                     '⚽', 'bronze',    20),
  ('hat_trick',       'Hat-trick Hero',     'Three goals in one night.',                          '🎩', 'gold',      21),
  ('four_goals',      'Poacher',            'Four or more in a single game.',                     '🦊', 'legendary', 22),
  ('goals_10',        'Double Figures',     'Ten career goals.',                                  '🔟', 'silver',    23),
  ('goals_50',        'Fifty Club',         'Fifty career goals.',                                '🏅', 'legendary', 24),

  -- Flair
  ('first_nutmeg',    'Through the Legs',   'Your first nutmeg. It counts forever.',              '🥜', 'bronze',    30),
  ('nutmeg_3',        'Nutmeg Merchant',    'Three nutmegs in one night.',                        '🪄', 'gold',      31),
  ('nutmegs_25',      'Panna King',         'Twenty-five career nutmegs.',                        '👑', 'legendary', 32),

  -- Making things happen
  ('first_assist',    'Provider',           'Your first assist.',                                 '🎁', 'bronze',    40),
  ('assists_3',       'Puppet Master',      'Three assists in one night.',                        '🪡', 'gold',      41),

  -- The dirty work
  ('tackles_10',      'The Wall',           'Ten tackles in a single game.',                      '🧱', 'silver',    50),
  ('clean_sheet',     'Clean Sheet',        'Your team conceded nothing.',                        '🧼', 'silver',    51),
  ('saves_10',        'Safe Hands',         'Ten saves in one night in goal.',                    '🧤', 'gold',      52),

  -- Character
  ('motm',            'Man of the Match',   'Voted the best player on the night.',                '⭐', 'silver',    60),
  ('motm_5',          'Crowd Favourite',    'Five man-of-the-match awards.',                      '🌟', 'gold',      61),
  ('humble',          'Humble',             'Rated yourself modestly, then won the votes anyway.','😇', 'gold',      62),
  ('own_goal',        'Wrong Net',          'Scored past your own keeper. It happens.',           '🙃', 'bronze',    63),
  ('full_house',      'Full House',         'A goal, an assist and a nutmeg in one night.',       '🎰', 'legendary', 64);
