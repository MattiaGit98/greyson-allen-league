begin;

insert into public.seasons(name, status, is_active) values ('2025/26', 'offseason', true)
on conflict (name) do update set status = excluded.status, is_active = true;

insert into public.teams(code, name, slug, owner_name) values ('CSS', 'COPPEDÈ SUPERSONICS', 'css', 'MATTIA L.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('CSP', 'COLD SHOWERS PODCASTER', 'csp', 'FRANCESCO D. & SV & GMB')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('CHA', 'CHARLOTTE HORNY', 'cha', 'GIANFRANCO I.G.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('FAS', 'FANTANTONIO SPURS', 'fas', 'VALERIO L.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('SBB', 'SAN BASILIO BULLETS', 'sbb', 'SEBASTIANO P.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('CCH', 'CINECITTÀ HEAT', 'cch', 'DAVIDE B.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('PPL', 'PRIMA PORTA LERBA', 'ppl', 'MATTEO I.G. & VALERIO P.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('PSP', 'PHILADELPHIA SPALMABILE', 'psp', 'GABRIELE M. & RICCARDO')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('MBF', 'MEDELLIN BAMBA FARMERS', 'mbf', 'LUCA T. & FEDERICO')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('MMB', 'MONTE MARIO BOARS', 'mmb', 'MATTEO R.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('BCT', 'BIBBIANO CITY THUNDER', 'bct', 'FLAVIO C. & PC & LG')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('BWE', 'BOLZANO WEIERSTRASS', 'bwe', 'ALESSANDRO Q.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('ORF', 'ORLANDO FURIOSO', 'orf', 'FRANCESCO C.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;
insert into public.teams(code, name, slug, owner_name) values ('SDR', 'SBRONZI DI RIACE', 'sdr', 'ANDREA C. & GIUSEPPE R.')
on conflict (code) do update set name = excluded.name, slug = excluded.slug, owner_name = excluded.owner_name, active = true;

insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 622 from public.teams t cross join public.seasons s where t.code = 'CSS' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 165 from public.teams t cross join public.seasons s where t.code = 'CSP' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 192 from public.teams t cross join public.seasons s where t.code = 'CHA' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 477 from public.teams t cross join public.seasons s where t.code = 'FAS' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 382 from public.teams t cross join public.seasons s where t.code = 'SBB' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 365 from public.teams t cross join public.seasons s where t.code = 'CCH' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 709 from public.teams t cross join public.seasons s where t.code = 'PPL' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 34 from public.teams t cross join public.seasons s where t.code = 'PSP' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 610 from public.teams t cross join public.seasons s where t.code = 'MBF' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 816 from public.teams t cross join public.seasons s where t.code = 'MMB' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 668 from public.teams t cross join public.seasons s where t.code = 'BCT' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 613 from public.teams t cross join public.seasons s where t.code = 'BWE' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 941 from public.teams t cross join public.seasons s where t.code = 'ORF' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();
insert into public.team_seasons(team_id, season_id, initial_credits, current_credits)
select t.id, s.id, 1000, 891 from public.teams t cross join public.seasons s where t.code = 'SDR' and s.name = '2025/26'
on conflict (team_id, season_id) do update set current_credits = excluded.current_credits, updated_at = now();

insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Mark Williams', 'mark williams', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jamal Murray', 'jamal murray', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Brandon Ingram', 'brandon ingram', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Trey Murphy III', 'trey murphy iii', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cooper Flagg', 'cooper flagg', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Stephon Castle', 'stephon castle', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Toumani Camara', 'toumani camara', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Liam McNeeley', 'liam mcneeley', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kam Jones', 'kam jones', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jase Richardson', 'jase richardson', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Lonzo Ball', 'lonzo ball', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Luka Doncic', 'luka doncic', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jarrett Allen', 'jarrett allen', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Franz Wagner', 'franz wagner', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Deandre Ayton', 'deandre ayton', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Zaccharie Risacher', 'zaccharie risacher', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jordan Poole', 'jordan poole', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Christian Braun', 'christian braun', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Devin Vassell', 'devin vassell', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Collin Murray-Boyles', 'collin murray boyles', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Goga Bitadze', 'goga bitadze', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Day''Ron Sharpe', 'day ron sharpe', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ty Jerome', 'ty jerome', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Davion Mitchell', 'davion mitchell', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Tristan Da Silva', 'tristan da silva', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Danny Wolf', 'danny wolf', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Noah Penda', 'noah penda', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Oso Ighodaro', 'oso ighodaro', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nikola Jokic', 'nikola jokic', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Anthony Edwards', 'anthony edwards', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Keegan Murray', 'keegan murray', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nemias Queta', 'nemias queta', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cedric Coward', 'cedric coward', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Max Christie', 'max christie', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ryan Dunn', 'ryan dunn', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cody Williams', 'cody williams', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Karl-Anthony Towns', 'karl anthony towns', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ja Morant', 'ja morant', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kristaps Porzingis', 'kristaps porzingis', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Donte DiVincenzo', 'donte divincenzo', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Sam Hauser', 'sam hauser', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('DeAndre Hunter', 'deandre hunter', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Maxime Raynaud', 'maxime raynaud', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Terance Mann', 'terance mann', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Trae Young', 'trae young', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Donovan Mitchell', 'donovan mitchell', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Donovan Clingan', 'donovan clingan', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jonathan Kuminga', 'jonathan kuminga', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('O.G. Anunoby', 'o g anunoby', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Robert Williams', 'robert williams', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nikola Jovic', 'nikola jovic', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kon Knueppel', 'kon knueppel', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('A.J. Johnson', 'a j johnson', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nolan Traore', 'nolan traore', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jaime Jaquez Jr.', 'jaime jaquez jr', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Tari Eason', 'tari eason', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ryan Rollins', 'ryan rollins', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jaden Hardy', 'jaden hardy', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Guerschon Yabusele', 'guerschon yabusele', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Shai Gilgeous-Alexander', 'shai gilgeous alexander', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Myles Turner', 'myles turner', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jabari Smith Jr.', 'jabari smith jr', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Reed Sheppard', 'reed sheppard', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Rob Dillingham', 'rob dillingham', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Yang Hansen', 'yang hansen', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ron Holland', 'ron holland', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Aaron Nesmith', 'aaron nesmith', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Bilal Coulibaly', 'bilal coulibaly', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nikola Topic', 'nikola topic', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Isaiah Collier', 'isaiah collier', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Dalton Knecht', 'dalton knecht', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Carter Bryant', 'carter bryant', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('De''Aaron Fox', 'de aaron fox', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kawhi Leonard', 'kawhi leonard', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jalen Green', 'jalen green', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('John Collins', 'john collins', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Khaman Maluach', 'khaman maluach', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Quinten Post', 'quinten post', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kyshawn George', 'kyshawn george', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Anthony Black', 'anthony black', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Walter Clayton Jr.', 'walter clayton jr', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Zion Williamson', 'zion williamson', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Evan Mobley', 'evan mobley', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jalen Duren', 'jalen duren', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Josh Giddey', 'josh giddey', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cade Cunningham', 'cade cunningham', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Damian Lillard', 'damian lillard', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Matas Buzelis', 'matas buzelis', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Yves Missi', 'yves missi', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('V.J. Edgecombe', 'v j edgecombe', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Tre Johnson', 'tre johnson', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Andrew Nembhard', 'andrew nembhard', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jalen Suggs', 'jalen suggs', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Derik Queen', 'derik queen', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Asa Newell', 'asa newell', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Scottie Barnes', 'scottie barnes', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jakob Poeltl', 'jakob poeltl', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kevin Porter Jr.', 'kevin porter jr', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Dylan Harper', 'dylan harper', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Gregory Jackson', 'gregory jackson', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Fred VanVleet', 'fred vanvleet', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Moussa Diabate', 'moussa diabate', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Adem Bona', 'adem bona', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cole Anthony', 'cole anthony', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Joan Beringer', 'joan beringer', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kasparas Jakucionis', 'kasparas jakucionis', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Max Shulga', 'max shulga', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Walker Kessler', 'walker kessler', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Anfernee Simons', 'anfernee simons', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ace Bailey', 'ace bailey', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Egor Demin', 'egor demin', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kyle Kuzma', 'kyle kuzma', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cam Thomas', 'cam thomas', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cason Wallace', 'cason wallace', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jarace Walker', 'jarace walker', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kyle Filipowski', 'kyle filipowski', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Herbert Jones', 'herbert jones', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jamal Shead', 'jamal shead', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nique Clifford', 'nique clifford', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ben Saraf', 'ben saraf', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Alperen Sengun', 'alperen sengun', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jusuf Nurkic', 'jusuf nurkic', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Santi Aldama', 'santi aldama', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Obi Toppin', 'obi toppin', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Caris LeVert', 'caris levert', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Quentin Grimes', 'quentin grimes', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Noa Essenge', 'noa essenge', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ryan Kalkbrenner', 'ryan kalkbrenner', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Chaz Lanier', 'chaz lanier', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Dejounte Murray', 'dejounte murray', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Desmond Bane', 'desmond bane', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jaren Jackson Jr.', 'jaren jackson jr', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Alexander Sarr', 'alexander sarr', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Zach Edey', 'zach edey', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Carlton Carrington', 'carlton carrington', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Tristan Vukcevic', 'tristan vukcevic', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Rasheer Fleming', 'rasheer fleming', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Micheal Porter Jr.', 'micheal porter jr', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kel''El Ware', 'kel el ware', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jeremiah Fears', 'jeremiah fears', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Johni Broome', 'johni broome', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Scotty Pippen Jr.', 'scotty pippen jr', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Zach Lavine', 'zach lavine', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('C.J. McCollum', 'c j mccollum', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Guy Santos', 'guy santos', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Malik Monk', 'malik monk', 'G'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jaylin Williams', 'jaylin williams', 'A'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Konan Niederhauser', 'konan niederhauser', 'C'::public.player_role, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Nickeil Alexander-Walker', 'nickeil alexander walker', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Ajay Mitchell', 'ajay mitchell', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Dylan Cardwell', 'dylan cardwell', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jaylon Tyson', 'jaylon tyson', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Noah Clowney', 'noah clowney', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Marcus Sasser', 'marcus sasser', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Miles McBride', 'miles mcbride', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jock Landale', 'jock landale', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Brice Sensabaugh', 'brice sensabaugh', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Royce O''Neale', 'royce o neale', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Josh Minott', 'josh minott', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Luke Kornet', 'luke kornet', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Grayson Allen', 'grayson allen', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Simone Fontecchio', 'simone fontecchio', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cam Spencer', 'cam spencer', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Cam Whitmore', 'cam whitmore', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Jared McCain', 'jared mccain', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Klay Thompson', 'klay thompson', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Peyton Watson', 'peyton watson', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Julian Champagnie', 'julian champagnie', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Will Richard', 'will richard', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Russell Westbrook', 'russell westbrook', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Saddiq Bey', 'saddiq bey', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Naji Marshall', 'naji marshall', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Kevon Looney', 'kevon looney', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Dwight Powell', 'dwight powell', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Collin Gillespie', 'collin gillespie', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Clint Capela', 'clint capela', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Sandro Mamukelashvili', 'sandro mamukelashvili', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Collin Sexton', 'collin sexton', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Tim Hardaway Jr.', 'tim hardaway jr', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Sam Merrill', 'sam merrill', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Daron Holmes II', 'daron holmes ii', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Tre Jones', 'tre jones', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Josh Okogie', 'josh okogie', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Duncan Robinson', 'duncan robinson', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();
insert into public.players(full_name, normalized_name, role, on_dunkest_list) values ('Scoot Henderson', 'scoot henderson', null, false)
on conflict (normalized_name) do update set full_name = excluded.full_name, role = coalesce(excluded.role, public.players.role), updated_at = now();

delete from public.qualifying_offer_rights where season_id = (select id from public.seasons where name = '2025/26');
delete from public.imported_draft_assets where season_id = (select id from public.seasons where name = '2025/26');
delete from public.roster_entries where season_id = (select id from public.seasons where name = '2025/26') and acquisition_type = 'initial_import';

insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 109, 109, null, 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'mark williams'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 75, 75, null, 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'jamal murray'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 69, 69, null, 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'brandon ingram'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 54, 54, null, 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'trey murphy iii'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 25, 25, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'cooper flagg'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 22, 22, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'stephon castle'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 17, 17, null, 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'toumani camara'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'liam mcneeley'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'kam jones'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'jase richardson'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'cut'::public.roster_status, 'initial_import', 4, 4, null, 0
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'lonzo ball'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 451, 451, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'luka doncic'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 137, 137, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'jarrett allen'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 105, 105, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'franz wagner'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 68, 68, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'deandre ayton'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 26, 26, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'zaccharie risacher'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 14, 14, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'jordan poole'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 10, 10, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'christian braun'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 9, 9, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'devin vassell'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 7, 7, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'collin murray boyles'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'goga bitadze'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'day ron sharpe'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'ty jerome'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'davion mitchell'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'tristan da silva'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'danny wolf'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'noah penda'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'oso ighodaro'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 549, 549, null, 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'nikola jokic'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 239, 239, null, 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'anthony edwards'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 13, 13, null, 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'keegan murray'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'nemias queta'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'cedric coward'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'max christie'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'ryan dunn'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'cut'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'cody williams'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 260, 260, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'karl anthony towns'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 180, 180, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'ja morant'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 60, 60, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'kristaps porzingis'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 16, 16, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'donte divincenzo'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'sam hauser'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'deandre hunter'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'maxime raynaud'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'cut'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'terance mann'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 252, 252, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'trae young'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 174, 174, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'donovan mitchell'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 50, 50, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'donovan clingan'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 43, 43, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'jonathan kuminga'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 29, 29, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'o g anunoby'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 18, 18, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'robert williams'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 15, 15, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'nikola jovic'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 13, 13, 'team', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'kon knueppel'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 6, 6, 'team', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'a j johnson'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 6, 6, 'team', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'nolan traore'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'jaime jaquez jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'tari eason'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 5, 5, 'team', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'ryan rollins'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'jaden hardy'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'cody williams'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'cut'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'SBB' join public.players p on p.normalized_name = 'guerschon yabusele'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 489, 489, null, 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'shai gilgeous alexander'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 72, 72, null, 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'myles turner'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 27, 27, null, 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'jabari smith jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 18, 18, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'reed sheppard'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 10, 10, 'team', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'rob dillingham'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 6, 6, 'team', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'yang hansen'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 4, 4, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'ron holland'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 3, 3, null, 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'aaron nesmith'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'bilal coulibaly'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'nikola topic'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'isaiah collier'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'dalton knecht'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'carter bryant'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 109, 109, null, 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'de aaron fox'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 94, 94, null, 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'kawhi leonard'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 52, 52, null, 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'jalen green'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 15, 15, null, 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'john collins'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 9, 9, 'team', 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'khaman maluach'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 5, 5, 'team', 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'quinten post'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'kyshawn george'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 5, 5, 'team', 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'anthony black'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'walter clayton jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 182, 182, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'zion williamson'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 180, 180, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'evan mobley'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 163, 163, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'jalen duren'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 163, 163, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'josh giddey'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 162, 162, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'cade cunningham'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 45, 45, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'damian lillard'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 20, 20, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'matas buzelis'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 16, 16, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'yves missi'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 11, 11, 'team', 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'v j edgecombe'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 10, 10, 'team', 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'tre johnson'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 5, 5, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'andrew nembhard'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'jalen suggs'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 5, 5, 'team', 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'derik queen'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'team', 0
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'asa newell'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 216, 216, null, 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'scottie barnes'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 77, 77, null, 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'jakob poeltl'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 31, 31, null, 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'kevin porter jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 20, 20, 'team', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'dylan harper'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 18, 18, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'gregory jackson'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 9, 9, null, 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'fred vanvleet'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 9, 9, 'team', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'moussa diabate'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 6, 6, 'team', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'adem bona'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'cole anthony'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'joan beringer'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'kasparas jakucionis'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'max shulga'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 99, 99, null, 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'walker kessler'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 36, 36, null, 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'anfernee simons'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 16, 16, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'ace bailey'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 8, 8, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'egor demin'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 6, 6, null, 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'kyle kuzma'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 4, 4, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'cam thomas'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 4, 4, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'cason wallace'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'jarace walker'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'kyle filipowski'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'herbert jones'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 5, 5, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'jamal shead'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'nique clifford'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'ben saraf'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 302, 302, null, 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'alperen sengun'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 8, 8, null, 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'jusuf nurkic'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 8, 8, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'santi aldama'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 4, 4, null, 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'obi toppin'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 3, 3, null, 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'caris levert'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'quentin grimes'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 3, 3, 'team', 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'noa essenge'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'ryan kalkbrenner'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'chaz lanier'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 138, 138, null, 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'dejounte murray'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 89, 89, null, 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'desmond bane'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 77, 77, null, 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'jaren jackson jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 40, 40, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'alexander sarr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 32, 32, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'zach edey'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 8, 8, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'carlton carrington'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'team', 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'tristan vukcevic'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'rasheer fleming'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 39, 39, null, 0
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'micheal porter jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 14, 14, 'qualifying', 0
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'kel el ware'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 4, 4, 'team', 0
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'jeremiah fears'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'johni broome'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'cut'::public.roster_status, 'initial_import', 1, 1, null, 0
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'scotty pippen jr'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 54, 54, null, 0
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'zach lavine'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 44, 44, null, 0
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'c j mccollum'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 6, 6, 'team', 0
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'guy santos'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'regular'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, null, 0
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'malik monk'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 2, 2, 'team', 0
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'jaylin williams'
where s.name = '2025/26';
insert into public.roster_entries(season_id, team_id, player_id, slot, status, acquisition_type, acquisition_cost, current_cost, option_type, extension_count)
select s.id, t.id, p.id, 'g_league'::public.slot_type, 'active'::public.roster_status, 'initial_import', 1, 1, 'team', 0
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'konan niederhauser'
where s.name = '2025/26';

insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 9, 'eligible'
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'nickeil alexander walker'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 5, 'eligible'
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'ajay mitchell'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'dylan cardwell'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'jaylon tyson'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CSS' join public.players p on p.normalized_name = 'noah clowney'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 5, 'eligible'
from public.seasons s join public.teams t on t.code = 'CSP' join public.players p on p.normalized_name = 'marcus sasser'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 9, 'eligible'
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'miles mcbride'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'jock landale'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'brice sensabaugh'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CHA' join public.players p on p.normalized_name = 'royce o neale'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 10, 'eligible'
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'josh minott'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 9, 'eligible'
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'luke kornet'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 3, 'eligible'
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'grayson allen'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 3, 'eligible'
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'simone fontecchio'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'FAS' join public.players p on p.normalized_name = 'cam spencer'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 6, 'eligible'
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'cam whitmore'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'jared mccain'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'CCH' join public.players p on p.normalized_name = 'klay thompson'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 5, 'eligible'
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'peyton watson'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 5, 'eligible'
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'julian champagnie'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'PPL' join public.players p on p.normalized_name = 'will richard'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 5, 'eligible'
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'russell westbrook'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 3, 'eligible'
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'saddiq bey'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 3, 'eligible'
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'naji marshall'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'kevon looney'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'PSP' join public.players p on p.normalized_name = 'dwight powell'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 9, 'eligible'
from public.seasons s join public.teams t on t.code = 'MBF' join public.players p on p.normalized_name = 'collin gillespie'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 6, 'eligible'
from public.seasons s join public.teams t on t.code = 'MMB' join public.players p on p.normalized_name = 'clint capela'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 15, 'eligible'
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'sandro mamukelashvili'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 9, 'eligible'
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'collin sexton'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'BCT' join public.players p on p.normalized_name = 'tim hardaway jr'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 3, 'eligible'
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'sam merrill'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'BWE' join public.players p on p.normalized_name = 'daron holmes ii'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 5, 'eligible'
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'tre jones'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'josh okogie'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'ORF' join public.players p on p.normalized_name = 'duncan robinson'
where s.name = '2025/26';
insert into public.qualifying_offer_rights(season_id, team_id, player_id, qualifying_amount, status)
select s.id, t.id, p.id, 1, 'eligible'
from public.seasons s join public.teams t on t.code = 'SDR' join public.players p on p.normalized_name = 'scoot henderson'
where s.name = '2025/26';

insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'SDR'
from public.seasons s join public.teams t on t.code = 'CSS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'CSS'
from public.seasons s join public.teams t on t.code = 'CSS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'C.p. se 1a 2027 CSS in top 5', '1° giro', 2028, 'CSS'
from public.seasons s join public.teams t on t.code = 'CSS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'CSP'
from public.seasons s join public.teams t on t.code = 'CSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Soggetta a dir swap con SDR', '1° giro', 2027, 'CSP'
from public.seasons s join public.teams t on t.code = 'CSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'CSP'
from public.seasons s join public.teams t on t.code = 'CSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'CSP'
from public.seasons s join public.teams t on t.code = 'CSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'CSP'
from public.seasons s join public.teams t on t.code = 'CSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'CHA'
from public.seasons s join public.teams t on t.code = 'CHA' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'CHA'
from public.seasons s join public.teams t on t.code = 'CHA' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'FAS'
from public.seasons s join public.teams t on t.code = 'FAS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'FAS'
from public.seasons s join public.teams t on t.code = 'FAS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'FAS'
from public.seasons s join public.teams t on t.code = 'FAS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'FAS'
from public.seasons s join public.teams t on t.code = 'FAS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'FAS'
from public.seasons s join public.teams t on t.code = 'FAS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'FAS'
from public.seasons s join public.teams t on t.code = 'FAS' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'SBB'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'PSP'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'CHA'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'SBB'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'MBF'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'SBB'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'SBB'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'SBB'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'SBB'
from public.seasons s join public.teams t on t.code = 'SBB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'CCH'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'SDR'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'BWE'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'CHA'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'CCH'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'PSP'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'CCH'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'SDR'
from public.seasons s join public.teams t on t.code = 'CCH' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'PPL'
from public.seasons s join public.teams t on t.code = 'PPL' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'BCT'
from public.seasons s join public.teams t on t.code = 'PPL' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'PPL'
from public.seasons s join public.teams t on t.code = 'PPL' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'PPL'
from public.seasons s join public.teams t on t.code = 'PPL' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'C.p. se 1a 2027 PPL in top 5', '1° giro', 2028, 'PPL'
from public.seasons s join public.teams t on t.code = 'PPL' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'PPL'
from public.seasons s join public.teams t on t.code = 'PPL' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'BCT'
from public.seasons s join public.teams t on t.code = 'PSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'PSP'
from public.seasons s join public.teams t on t.code = 'PSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'CHA'
from public.seasons s join public.teams t on t.code = 'PSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'ORF'
from public.seasons s join public.teams t on t.code = 'PSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'PSP'
from public.seasons s join public.teams t on t.code = 'PSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'CSS'
from public.seasons s join public.teams t on t.code = 'PSP' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'MBF'
from public.seasons s join public.teams t on t.code = 'MBF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'ORF'
from public.seasons s join public.teams t on t.code = 'MBF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'MBF'
from public.seasons s join public.teams t on t.code = 'MBF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'MBF'
from public.seasons s join public.teams t on t.code = 'MBF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'MBF'
from public.seasons s join public.teams t on t.code = 'MBF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'MBF'
from public.seasons s join public.teams t on t.code = 'MBF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'MMB'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'CSP'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'BWE'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2026, 'CSS'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'MMB'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'ORF'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'MMB'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Protetta top 5, 1a 2028 CSS', '1° giro', 2027, 'CSS'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Protetta top 5, 1a 2028 PPL', '1° giro', 2027, 'PPL'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'MMB'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'CHA'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'MMB'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'CCH'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'MMB'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'CCH'
from public.seasons s join public.teams t on t.code = 'MMB' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'BCT'
from public.seasons s join public.teams t on t.code = 'BCT' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'BCT'
from public.seasons s join public.teams t on t.code = 'BCT' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'BCT'
from public.seasons s join public.teams t on t.code = 'BCT' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'BCT'
from public.seasons s join public.teams t on t.code = 'BCT' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'BWE'
from public.seasons s join public.teams t on t.code = 'BWE' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'BWE'
from public.seasons s join public.teams t on t.code = 'BWE' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'BWE'
from public.seasons s join public.teams t on t.code = 'BWE' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'BWE'
from public.seasons s join public.teams t on t.code = 'BWE' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'PSP'
from public.seasons s join public.teams t on t.code = 'BWE' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2027, 'ORF'
from public.seasons s join public.teams t on t.code = 'ORF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'ORF'
from public.seasons s join public.teams t on t.code = 'ORF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2028, 'ORF'
from public.seasons s join public.teams t on t.code = 'ORF' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'CCH'
from public.seasons s join public.teams t on t.code = 'SDR' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'CSS'
from public.seasons s join public.teams t on t.code = 'SDR' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2026, 'PSP'
from public.seasons s join public.teams t on t.code = 'SDR' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Diritto di swap con CSP', '1° giro', 2027, 'SDR'
from public.seasons s join public.teams t on t.code = 'SDR' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '2° giro', 2027, 'SDR'
from public.seasons s join public.teams t on t.code = 'SDR' where s.name = '2025/26';
insert into public.imported_draft_assets(season_id, owning_team_id, label, round_text, draft_year, origin_or_overall)
select s.id, t.id, 'Scelta', '1° giro', 2028, 'SDR'
from public.seasons s join public.teams t on t.code = 'SDR' where s.name = '2025/26';

commit;

select
  (select count(*) from public.teams) as teams,
  (select count(*) from public.players) as players,
  (select count(*) from public.roster_entries where status = 'active') as active_roster_entries,
  (select count(*) from public.roster_entries where status = 'cut') as cut_entries,
  (select count(*) from public.qualifying_offer_rights) as qualifying_offer_rights,
  (select count(*) from public.imported_draft_assets) as draft_assets;
